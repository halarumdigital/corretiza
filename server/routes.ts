import type { Express, Request } from "express";
import express from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { getStorage } from "./storage";

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}
import { 
  authenticate, requireAdmin, requireClient, requireCompanyAccess, 
  generateToken, hashPassword, comparePassword, AuthRequest 
} from "./auth";
import { EvolutionApiService } from "./services/evolutionApi";
import { OpenAiService } from "./services/openai";
import { ObjectStorageService } from "./objectStorage";
import { extractTextFromMultiplePDFs } from "./pdfProcessor";
import { AiResponseService } from "./aiResponseService";
import { whatsappWebhookService } from "./services/whatsappWebhook";
import {
  insertUserSchema, insertCompanySchema, insertGlobalConfigSchema,
  insertEvolutionConfigSchema, insertAiConfigSchema, insertWhatsappInstanceSchema,
  insertAiAgentSchema, insertConversationSchema, insertMessageSchema,
  insertContactListSchema, insertContactListItemSchema, insertScheduledMessageSchema,
  insertCustomerSchema, insertLeadSchema, insertPropertySchema,
  insertCompanyCustomDomainSchema, insertPlanSchema, insertBrokerSchema, insertAppointmentSchema
} from "@shared/schema";
import { getEmailService } from "./services/emailService";

// Cache para evitar processamento duplicado de mensagens
// Armazena IDs de mensagens já processadas com timestamp de expiração
const processedMessagesCache = new Map<string, number>();
const CACHE_EXPIRY_MS = 60000; // 60 segundos - tempo suficiente para evitar duplicação

// Função para limpar cache expirado periodicamente
function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, timestamp] of processedMessagesCache.entries()) {
    if (now - timestamp > CACHE_EXPIRY_MS) {
      processedMessagesCache.delete(key);
    }
  }
}

// Limpar cache a cada 30 segundos
setInterval(cleanExpiredCache, 30000);

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize storage connection
  const storage = getStorage();
  await storage.init();

  // Initialize global funnel stages if they don't exist
  await storage.initializeGlobalFunnelStages();

  // Configure multer for file uploads
  const storage_config = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadType = req.path.includes('logo') ? 'logos' : 'favicons';
      const uploadPath = path.join(process.cwd(), 'uploads', uploadType);
      
      // Ensure directory exists
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uploadType = req.path.includes('logo') ? 'logo' : 'favicon';
      const timestamp = Date.now();
      const ext = path.extname(file.originalname);
      cb(null, `${uploadType}-${timestamp}${ext}`);
    }
  });

  const upload = multer({ 
    storage: storage_config,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Tipo de arquivo não permitido'));
      }
    }
  });

  // Configure multer for property images
  const propertyImageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(process.cwd(), 'uploads', 'properties');
      
      // Ensure directory exists
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(7);
      const ext = path.extname(file.originalname);
      cb(null, `property-${timestamp}-${randomString}${ext}`);
    }
  });

  const uploadPropertyImages = multer({
    storage: propertyImageStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit per image
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Apenas imagens são permitidas (JPEG, PNG, GIF, WebP)'));
      }
    }
  });

  // Serve static files from uploads directory
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
  
  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email e senha são obrigatórios" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Credenciais inválidas" });
      }

      const isValidPassword = await comparePassword(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Credenciais inválidas" });
      }

      // Verificar se a empresa está ativa (apenas para clientes)
      if (user.role === 'client' && user.companyId) {
        const company = await storage.getCompany(user.companyId);
        if (!company || company.status !== 'active') {
          return res.status(403).json({ error: "Acesso bloqueado: sua empresa está com acesso desabilitado. Entre em contato com o administrador." });
        }
      }

      const token = generateToken(user);
      
      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          companyId: user.companyId
        }
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Erro interno do servidor" });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(409).json({ error: "Email já está em uso" });
      }

      const hashedPassword = await hashPassword(userData.password);
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword
      });

      const token = generateToken(user);
      
      res.status(201).json({
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          companyId: user.companyId
        }
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Erro interno do servidor" });
    }
  });

  app.get("/api/auth/me", authenticate, async (req: AuthRequest, res) => {
    try {
      // Buscar dados completos do usuário no banco
      const fullUser = await storage.getUser(req.user!.id);
      
      if (fullUser && fullUser.company_id && !req.user!.companyId) {
        // Se o usuário tem companyId no banco mas não no token, gerar novo token
        const userWithMappedFields = {
          ...fullUser,
          companyId: fullUser.company_id
        };
        const newToken = generateToken(userWithMappedFields);
        res.header('X-New-Token', newToken);
        res.json({ 
          user: userWithMappedFields,
          needsTokenRefresh: true,
          newToken
        });
      } else {
        res.json({ user: req.user });
      }
    } catch (error) {
      console.error('Auth me error:', error);
      res.json({ user: req.user });
    }
  });

  // Global configurations - Public view for branding
  app.get("/api/global-config/public", async (req, res) => {
    try {
      // Desabilitar cache HTTP para sempre obter configurações atualizadas
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      const config = await storage.getGlobalConfiguration();
      if (config) {
        // Return only visual/branding information (incluindo ID para validação no frontend)
        const publicConfig = {
          id: config.id, // Adicionar ID para que o ThemeProvider reconheça
          logo: config.logo,
          favicon: config.favicon,
          coresPrimaria: config.cores_primaria,
          coresSecundaria: config.cores_secundaria,
          coresFundo: config.cores_fundo,
          nomeSistema: config.nome_sistema,
          nomeRodape: config.nome_rodape,
          nomeAbaNavegador: config.nome_aba_navegador
        };
        res.json(publicConfig);
      } else {
        res.json({});
      }
    } catch (error) {
      console.error("Get public global config error:", error);
      res.status(500).json({ error: "Erro ao buscar configurações" });
    }
  });

  // Global configurations (Admin only)
  app.get("/api/global-config", authenticate, requireAdmin, async (req, res) => {
    try {
      const config = await storage.getGlobalConfiguration();
      res.json(config);
    } catch (error) {
      console.error("Get global config error:", error);
      res.status(500).json({ error: "Erro ao buscar configurações" });
    }
  });

  app.post("/api/global-config", authenticate, requireAdmin, async (req, res) => {
    try {
      const configData = insertGlobalConfigSchema.parse(req.body);
      const config = await storage.saveGlobalConfiguration(configData);
      res.json(config);
    } catch (error) {
      console.error("Save global config error:", error);
      res.status(500).json({ error: "Erro ao salvar configurações" });
    }
  });

  // File upload endpoints for global configuration
  app.post("/api/upload/logo", authenticate, requireAdmin, upload.single('logo'), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado" });
      }
      
      const filePath = `/uploads/logos/${req.file.filename}`;
      res.json({ 
        success: true, 
        filePath,
        message: "Logo enviado com sucesso"
      });
    } catch (error) {
      console.error("Upload logo error:", error);
      res.status(500).json({ error: "Erro ao fazer upload do logo" });
    }
  });

  app.post("/api/upload/favicon", authenticate, requireAdmin, upload.single('favicon'), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado" });
      }
      
      const filePath = `/uploads/favicons/${req.file.filename}`;
      res.json({ 
        success: true, 
        filePath,
        message: "Favicon enviado com sucesso"
      });
    } catch (error) {
      console.error("Upload favicon error:", error);
      res.status(500).json({ error: "Erro ao fazer upload do favicon" });
    }
  });

  // Evolution API configurations (Admin only)
  app.get("/api/evolution-config", authenticate, requireAdmin, async (req, res) => {
    try {
      const config = await storage.getEvolutionApiConfiguration();
      res.json(config);
    } catch (error) {
      console.error("Get evolution config error:", error);
      res.status(500).json({ error: "Erro ao buscar configurações" });
    }
  });

  app.post("/api/evolution-config", authenticate, requireAdmin, async (req, res) => {
    try {
      const configData = insertEvolutionConfigSchema.parse(req.body);
      const config = await storage.saveEvolutionApiConfiguration(configData);
      
      // Test connection
      const evolutionService = new EvolutionApiService({
        baseURL: config.evolutionURL,
        token: config.evolutionToken
      });
      
      const isConnected = await evolutionService.testConnection();
      
      res.json({ ...config, status: isConnected ? 'connected' : 'disconnected' });
    } catch (error) {
      console.error("Save evolution config error:", error);
      res.status(500).json({ error: "Erro ao salvar configurações" });
    }
  });

  app.post("/api/evolution-config/test", authenticate, requireAdmin, async (req, res) => {
    try {
      const config = await storage.getEvolutionApiConfiguration();
      if (!config) {
        return res.status(404).json({ error: "Configuração não encontrada" });
      }

      const evolutionService = new EvolutionApiService({
        baseURL: config.evolutionURL,
        token: config.evolutionToken
      });
      
      const isConnected = await evolutionService.testConnection();
      res.json({ connected: isConnected });
    } catch (error) {
      console.error("Test evolution connection error:", error);
      res.status(500).json({ error: "Erro ao testar conexão" });
    }
  });

  // AI configurations (Admin only)
  app.get("/api/ai-config", authenticate, requireAdmin, async (req, res) => {
    try {
      const config = await storage.getAiConfiguration();
      res.json(config);
    } catch (error) {
      console.error("Get AI config error:", error);
      res.status(500).json({ error: "Erro ao buscar configurações" });
    }
  });

  app.post("/api/ai-config", authenticate, requireAdmin, async (req, res) => {
    try {
      const configData = insertAiConfigSchema.parse(req.body);
      const config = await storage.saveAiConfiguration(configData);
      res.json(config);
    } catch (error) {
      console.error("Save AI config error:", error);
      res.status(500).json({ error: "Erro ao salvar configurações" });
    }
  });

  // Endpoint público para clientes acessarem configurações de IA (sem chave da API)
  app.get("/api/ai-config/public", authenticate, async (req, res) => {
    try {
      const config = await storage.getAiConfiguration();
      if (!config) {
        return res.json({ modelo: "gpt-4o", numeroTokens: 1000, temperatura: 0.7 });
      }
      
      // Retornar apenas campos seguros (sem a chave da API)
      res.json({
        modelo: config.modelo || "gpt-4o",
        numeroTokens: config.numeroTokens || 1000,
        temperatura: config.temperatura || 0.7
      });
    } catch (error) {
      console.error("Get public AI config error:", error);
      res.status(500).json({ error: "Erro ao buscar configurações" });
    }
  });

  app.post("/api/ai-config/test", authenticate, requireAdmin, async (req, res) => {
    try {
      const { prompt } = req.body;
      const config = await storage.getAiConfiguration();

      console.log("AI test config:", config);

      if (!config) {
        return res.status(404).json({ error: "Configuração de IA não encontrada" });
      }

      if (!config.apiKey) {
        return res.status(400).json({ error: "Chave da API OpenAI não configurada" });
      }

      const openAiService = new OpenAiService(config.apiKey);
      const response = await openAiService.generateResponse(
        prompt || "Olá! Este é um teste de funcionamento.",
        "Você é um assistente útil. Responda de forma breve e educada em português.",
        {
          model: config.modelo || 'gpt-4o',
          temperature: parseFloat((config.temperatura || 0.7).toString()),
          maxTokens: config.numeroTokens || 1000
        }
      );

      res.json({ response: response.content, usage: response.usage });
    } catch (error) {
      console.error("Test AI error:", error);
      res.status(500).json({
        error: "Erro ao testar IA",
        details: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  });

  app.get("/api/ai-config/models", authenticate, requireAdmin, async (req, res) => {
    try {
      const config = await storage.getAiConfiguration();

      if (!config || !config.apiKey) {
        return res.status(400).json({ error: "Chave da API OpenAI não configurada" });
      }

      const openAiService = new OpenAiService(config.apiKey);
      const models = await openAiService.listModels();

      res.json({ models });
    } catch (error) {
      console.error("List models error:", error);
      res.status(500).json({
        error: "Erro ao buscar modelos",
        details: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  });

  // Companies (Admin only)
  app.get("/api/companies", authenticate, requireAdmin, async (req, res) => {
    try {
      const companies = await storage.getAllCompanies();
      res.json(companies);
    } catch (error) {
      console.error("Get companies error:", error);
      res.status(500).json({ error: "Erro ao buscar empresas" });
    }
  });

  app.post("/api/companies", authenticate, requireAdmin, async (req, res) => {
    try {
      const { userEmail, userPassword, ...companyData } = req.body;
      
      // Validar dados da empresa
      const validatedCompanyData = insertCompanySchema.parse(companyData);
      
      // Criar empresa
      const company = await storage.createCompany(validatedCompanyData);
      
      // Criar usuário administrador da empresa (se fornecido)
      if (userEmail && userPassword) {
        const hashedPassword = await hashPassword(userPassword);
        const userData = {
          email: userEmail,
          password: hashedPassword,
          role: 'client' as const,
          companyId: company.id
        };
        
        await storage.createUser(userData);
      }
      
      res.status(201).json(company);
    } catch (error) {
      console.error("Create company error:", error);
      res.status(500).json({ error: "Erro ao criar empresa" });
    }
  });

  app.put("/api/companies/:id", authenticate, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { adminPassword, ...companyData } = req.body;

      // Obter status atual da empresa antes de atualizar
      const currentCompany = await storage.getCompany(id);
      const wasActive = currentCompany?.status === 'active';

      // Validar dados da empresa
      const validatedCompanyData = insertCompanySchema.partial().parse(companyData);

      // Atualizar dados da empresa
      const company = await storage.updateCompany(id, validatedCompanyData);

      // Se a empresa foi bloqueada (status mudou de active para inactive), excluir instâncias Evolution
      const isNowInactive = company.status === 'inactive';
      if (wasActive && isNowInactive) {
        console.log(`🚫 Empresa ${company.name} foi bloqueada. Excluindo instâncias Evolution API...`);

        try {
          // Buscar todas as instâncias WhatsApp da empresa
          const instances = await storage.getWhatsappInstancesByCompany(id);

          if (instances.length > 0) {
            // Buscar configuração da Evolution API
            const evolutionConfig = await storage.getEvolutionApiConfiguration();

            if (evolutionConfig) {
              const evolutionService = new EvolutionApiService({
                baseURL: evolutionConfig.evolutionURL,
                token: evolutionConfig.evolutionToken
              });

              // Excluir cada instância
              for (const instance of instances) {
                const instanceName = instance.evolutionInstanceId || instance.name;

                if (instanceName) {
                  try {
                    console.log(`🗑️ Excluindo instância Evolution: ${instanceName}`);
                    await evolutionService.deleteInstance(instanceName);
                    console.log(`✅ Instância ${instanceName} excluída da Evolution API`);
                  } catch (evolutionError) {
                    console.error(`⚠️ Erro ao excluir instância ${instanceName} da Evolution API:`, evolutionError);
                    // Continua mesmo se falhar na Evolution API
                  }
                }

                // Excluir do banco de dados
                await storage.deleteWhatsappInstance(instance.id);
                console.log(`✅ Instância ${instance.name} excluída do banco de dados`);
              }

              console.log(`✅ ${instances.length} instância(s) excluída(s) para empresa ${company.name}`);
            } else {
              console.warn(`⚠️ Configuração Evolution API não encontrada. Excluindo apenas do banco de dados.`);
              // Mesmo sem Evolution API, excluir do banco
              for (const instance of instances) {
                await storage.deleteWhatsappInstance(instance.id);
              }
            }
          } else {
            console.log(`ℹ️ Empresa ${company.name} não possui instâncias WhatsApp.`);
          }
        } catch (deleteError) {
          console.error(`❌ Erro ao excluir instâncias da empresa ${company.name}:`, deleteError);
          // Não falhar a atualização da empresa por erro na exclusão de instâncias
        }
      }

      // Se uma nova senha foi fornecida, atualizar a senha do admin da empresa
      if (adminPassword && adminPassword.trim() !== '') {
        if (adminPassword.length < 6) {
          return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres" });
        }

        const hashedPassword = await hashPassword(adminPassword);
        await storage.updateCompanyAdminPassword(id, hashedPassword);
      }

      res.json(company);
    } catch (error) {
      console.error("Update company error:", error);
      res.status(500).json({ error: "Erro ao atualizar empresa" });
    }
  });

  app.delete("/api/companies/:id", authenticate, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteCompany(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete company error:", error);
      res.status(500).json({ error: "Erro ao excluir empresa" });
    }
  });

  // Plans (Admin only)
  app.get("/api/plans", authenticate, requireAdmin, async (req, res) => {
    try {
      const plans = await storage.getAllPlans();
      res.json(plans);
    } catch (error) {
      console.error("Get plans error:", error);
      res.status(500).json({ error: "Erro ao buscar planos" });
    }
  });

  app.post("/api/plans", authenticate, requireAdmin, async (req, res) => {
    try {
      const validatedData = insertPlanSchema.parse(req.body);
      const plan = await storage.createPlan(validatedData);
      res.status(201).json(plan);
    } catch (error) {
      console.error("Create plan error:", error);
      res.status(500).json({ error: "Erro ao criar plano" });
    }
  });

  app.put("/api/plans/:id", authenticate, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertPlanSchema.partial().parse(req.body);
      const plan = await storage.updatePlan(id, validatedData);
      res.json(plan);
    } catch (error) {
      console.error("Update plan error:", error);
      res.status(500).json({ error: "Erro ao atualizar plano" });
    }
  });

  app.delete("/api/plans/:id", authenticate, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deletePlan(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete plan error:", error);
      res.status(500).json({ error: "Erro ao excluir plano" });
    }
  });

  // Admin Users - Gerenciamento de usuários administrativos
  app.get("/api/admin/users", authenticate, requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllAdminUsers();
      res.json(users);
    } catch (error) {
      console.error("Get admin users error:", error);
      res.status(500).json({ error: "Erro ao buscar usuários administrativos" });
    }
  });

  app.post("/api/admin/users", authenticate, requireAdmin, async (req, res) => {
    try {
      const { name, email, password, role } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email e senha são obrigatórios" });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "Já existe um usuário com este email" });
      }

      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        name: name || null,
        email,
        password: hashedPassword,
        role: role || 'admin',
      });

      // Return without password
      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error("Create admin user error:", error);
      res.status(500).json({ error: "Erro ao criar usuário administrativo" });
    }
  });

  app.put("/api/admin/users/:id", authenticate, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { name, email, password, role } = req.body;

      // Check if user exists
      const existingUser = await storage.getUser(id);
      if (!existingUser) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      // If changing email, check for duplicates
      if (email && email !== existingUser.email) {
        const emailExists = await storage.getUserByEmail(email);
        if (emailExists) {
          return res.status(400).json({ error: "Já existe um usuário com este email" });
        }
      }

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (email) updates.email = email;
      if (role) updates.role = role;
      if (password) updates.password = await hashPassword(password);

      const updatedUser = await storage.updateUser(id, updates);

      // Return without password
      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Update admin user error:", error);
      res.status(500).json({ error: "Erro ao atualizar usuário administrativo" });
    }
  });

  app.delete("/api/admin/users/:id", authenticate, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      // Prevent deleting yourself
      if (req.user?.id === id) {
        return res.status(400).json({ error: "Você não pode excluir seu próprio usuário" });
      }

      // Check if user exists
      const existingUser = await storage.getUser(id);
      if (!existingUser) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      await storage.deleteUser(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete admin user error:", error);
      res.status(500).json({ error: "Erro ao excluir usuário administrativo" });
    }
  });

  // Brokers (Corretores) - Client routes
  app.get("/api/brokers", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(400).json({ error: "Company ID não encontrado" });
      }

      const brokers = await storage.getBrokersByCompany(req.user.companyId);
      res.json(brokers);
    } catch (error) {
      console.error("Error fetching brokers:", error);
      res.status(500).json({ error: "Erro ao buscar corretores" });
    }
  });

  app.get("/api/brokers/limits", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(400).json({ error: "Company ID não encontrado" });
      }

      const company = await storage.getCompany(req.user.companyId);
      if (!company) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      let brokerLimit = 1;
      let planName = "Sem plano";
      if (company.planId) {
        const plan = await storage.getPlan(company.planId);
        if (plan) {
          brokerLimit = plan.agentLimit;
          planName = plan.name;
        }
      }

      const currentCount = await storage.countBrokersByCompany(req.user.companyId);

      res.json({
        currentCount,
        limit: brokerLimit,
        planName,
        canCreate: currentCount < brokerLimit
      });
    } catch (error) {
      console.error("Error fetching broker limits:", error);
      res.status(500).json({ error: "Erro ao buscar limites de corretores" });
    }
  });

  app.post("/api/brokers", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(400).json({ error: "Company ID não encontrado" });
      }

      // Verificar limite do plano
      const company = await storage.getCompany(req.user.companyId);
      if (!company) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      let brokerLimit = 1; // Limite padrão se não houver plano
      if (company.planId) {
        const plan = await storage.getPlan(company.planId);
        if (plan) {
          brokerLimit = plan.agentLimit;
        }
      }

      const currentBrokerCount = await storage.countBrokersByCompany(req.user.companyId);
      if (currentBrokerCount >= brokerLimit) {
        return res.status(403).json({
          error: `Limite de corretores atingido. Seu plano permite até ${brokerLimit} corretor(es).`,
          currentCount: currentBrokerCount,
          limit: brokerLimit
        });
      }

      const validatedData = insertBrokerSchema.parse({
        ...req.body,
        companyId: req.user.companyId
      });
      const broker = await storage.createBroker(validatedData);
      res.status(201).json(broker);
    } catch (error) {
      console.error("Error creating broker:", error);
      res.status(500).json({ error: "Erro ao criar corretor" });
    }
  });

  app.put("/api/brokers/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const broker = await storage.getBroker(id);
      if (!broker) {
        return res.status(404).json({ error: "Corretor não encontrado" });
      }

      if (broker.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Sem permissão para editar este corretor" });
      }

      const validatedData = insertBrokerSchema.partial().parse(req.body);
      const updatedBroker = await storage.updateBroker(id, validatedData);
      res.json(updatedBroker);
    } catch (error) {
      console.error("Error updating broker:", error);
      res.status(500).json({ error: "Erro ao atualizar corretor" });
    }
  });

  app.delete("/api/brokers/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const broker = await storage.getBroker(id);
      if (!broker) {
        return res.status(404).json({ error: "Corretor não encontrado" });
      }

      if (broker.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Sem permissão para excluir este corretor" });
      }

      await storage.deleteBroker(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting broker:", error);
      res.status(500).json({ error: "Erro ao deletar corretor" });
    }
  });

  // Appointments (Agendamentos) - Client routes
  app.get("/api/appointments", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(400).json({ error: "Company ID não encontrado" });
      }

      const appointments = await storage.getAppointmentsByCompany(req.user.companyId);
      res.json(appointments);
    } catch (error) {
      console.error("Error fetching appointments:", error);
      res.status(500).json({ error: "Erro ao buscar agendamentos" });
    }
  });

  app.get("/api/appointments/broker/:brokerId", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(400).json({ error: "Company ID não encontrado" });
      }

      const { brokerId } = req.params;

      // Verificar se o corretor pertence à empresa
      const broker = await storage.getBroker(brokerId);
      if (!broker || broker.companyId !== req.user.companyId) {
        return res.status(403).json({ error: "Sem permissão para acessar agendamentos deste corretor" });
      }

      const appointments = await storage.getAppointmentsByBroker(brokerId);
      res.json(appointments);
    } catch (error) {
      console.error("Error fetching broker appointments:", error);
      res.status(500).json({ error: "Erro ao buscar agendamentos do corretor" });
    }
  });

  app.get("/api/appointments/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const appointment = await storage.getAppointment(id);
      if (!appointment) {
        return res.status(404).json({ error: "Agendamento não encontrado" });
      }

      if (appointment.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Sem permissão para acessar este agendamento" });
      }

      res.json(appointment);
    } catch (error) {
      console.error("Error fetching appointment:", error);
      res.status(500).json({ error: "Erro ao buscar agendamento" });
    }
  });

  app.post("/api/appointments", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(400).json({ error: "Company ID não encontrado" });
      }

      const validatedData = insertAppointmentSchema.parse({
        ...req.body,
        companyId: req.user.companyId
      });
      const appointment = await storage.createAppointment(validatedData);
      res.status(201).json(appointment);
    } catch (error) {
      console.error("Error creating appointment:", error);
      res.status(500).json({ error: "Erro ao criar agendamento" });
    }
  });

  app.put("/api/appointments/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const appointment = await storage.getAppointment(id);
      if (!appointment) {
        return res.status(404).json({ error: "Agendamento não encontrado" });
      }

      if (appointment.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Sem permissão para editar este agendamento" });
      }

      const validatedData = insertAppointmentSchema.partial().parse(req.body);
      const updatedAppointment = await storage.updateAppointment(id, validatedData);
      res.json(updatedAppointment);
    } catch (error) {
      console.error("Error updating appointment:", error);
      res.status(500).json({ error: "Erro ao atualizar agendamento" });
    }
  });

  app.delete("/api/appointments/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const appointment = await storage.getAppointment(id);
      if (!appointment) {
        return res.status(404).json({ error: "Agendamento não encontrado" });
      }

      if (appointment.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Sem permissão para excluir este agendamento" });
      }

      await storage.deleteAppointment(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting appointment:", error);
      res.status(500).json({ error: "Erro ao deletar agendamento" });
    }
  });

  // Company profile (Client)
  app.get("/api/profile", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const company = await storage.getCompany(req.user.companyId);
      if (!company) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      res.json(company);
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({ error: "Erro ao buscar perfil" });
    }
  });

  app.put("/api/profile", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const companyData = insertCompanySchema.partial().parse(req.body);
      const company = await storage.updateCompany(req.user.companyId, companyData);
      res.json(company);
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ error: "Erro ao atualizar perfil" });
    }
  });

  // WhatsApp instances
  app.get("/api/whatsapp-instances", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const instances = await storage.getWhatsappInstancesByCompany(req.user.companyId);
      
      // Get Evolution API configuration to check real status
      const evolutionConfig = await storage.getEvolutionApiConfiguration();
      
      // If we have Evolution API config, update the status of each instance
      const updatedInstances = [];
      
      for (const instance of instances) {
        let currentStatus = instance.status;
        
        // Only check status if we have Evolution config and instance has evolutionInstanceId
        if (evolutionConfig && instance.evolutionInstanceId) {
          try {
            // CORREÇÃO: Usar o nome da instância se o evolutionInstanceId for UUID
            let instanceIdentifier = instance.evolutionInstanceId;
            if (instance.evolutionInstanceId.includes('-')) {
              console.log(`⚠️ Using name instead of UUID for ${instance.name}`);
              instanceIdentifier = instance.name;
            }

            const statusUrl = `${evolutionConfig.evolutionURL}/instance/connectionState/${instanceIdentifier}`;
            console.log(`🔍 Checking status for ${instance.name} at: ${statusUrl}`);
            
            const response = await fetch(statusUrl, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'apikey': evolutionConfig.evolutionToken,
              },
            });

            if (response.ok) {
              const statusData = await response.json();
              console.log(`📡 Evolution API response for ${instance.name}:`, statusData);
              
              // Check if instance is connected based on Evolution API response
              const evolutionState = statusData.instance?.state || statusData.state || statusData.status;

              // Mapear todos os possíveis estados da Evolution API
              let isConnected = false;
              if (evolutionState) {
                const connectedStates = ['open', 'connected', 'CONNECTED', 'online'];
                isConnected = connectedStates.includes(evolutionState);
              }

              const newStatus = isConnected ? 'connected' : 'disconnected';
              
              console.log(`🔄 Instance ${instance.name}: Evolution state="${evolutionState}", DB status="${instance.status}", New status="${newStatus}"`);
              
              // Update status in database if it changed
              if (newStatus !== instance.status) {
                console.log(`🔄 Updating ${instance.name} status from "${instance.status}" to "${newStatus}"`);
                await storage.updateWhatsappInstance(instance.id, { status: newStatus });
                currentStatus = newStatus;
              }
            } else {
              console.log(`❌ Failed to check status for ${instance.name}: ${response.status}`);
            }
          } catch (error) {
            console.error(`❌ Error checking status for ${instance.name}:`, error);
          }
        }
        
        updatedInstances.push({
          ...instance,
          status: currentStatus
        });
      }
      
      console.log("📋 Final instances being returned to frontend:");
      updatedInstances.forEach(instance => {
        console.log(`  - ID: ${instance.id}, Name: ${instance.name}, Status: ${instance.status}, EvolutionID: ${instance.evolutionInstanceId}`);
      });
      
      res.json(updatedInstances);
    } catch (error) {
      console.error("Get WhatsApp instances error:", error);
      res.status(500).json({ error: "Erro ao buscar instâncias" });
    }
  });

  app.post("/api/whatsapp-instances", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const instanceData = insertWhatsappInstanceSchema.parse({
        ...req.body,
        companyId: req.user.companyId
      });

      const instance = await storage.createWhatsappInstance(instanceData);

      // Create instance in Evolution API
      try {
        const evolutionConfig = await storage.getEvolutionApiConfiguration();
        if (evolutionConfig) {
          const evolutionService = new EvolutionApiService({
            baseURL: evolutionConfig.evolutionURL,
            token: evolutionConfig.evolutionToken
          });

          const evolutionResponse = await evolutionService.createInstance({
            instanceName: instance.id,
            qrcode: true
          });

          // Update instance with Evolution data and save instance-specific token
          await storage.updateWhatsappInstance(instance.id, {
            evolutionInstanceId: evolutionResponse.instance?.instanceName || instance.id,
            evolutionToken: evolutionResponse.hash?.apikey || evolutionResponse.apikey
          });
        }
      } catch (evolutionError) {
        console.error("Evolution API error:", evolutionError);
      }

      res.status(201).json(instance);
    } catch (error) {
      console.error("Create WhatsApp instance error:", error);
      res.status(500).json({ error: "Erro ao criar instância" });
    }
  });

  app.put("/api/whatsapp-instances/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      console.log(`🔧 PUT request for instance ${id} with data:`, req.body);
      
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      // Verificar se a instância pertence à empresa do usuário
      const existingInstance = await storage.getWhatsappInstance(id);
      console.log(`🔍 Existing instance:`, existingInstance);
      
      if (!existingInstance || existingInstance.companyId !== req.user.companyId) {
        return res.status(404).json({ error: "Instância não encontrada" });
      }

      const instanceData = insertWhatsappInstanceSchema.partial().parse(req.body);
      console.log(`📝 Parsed instance data:`, instanceData);
      
      const updatedInstance = await storage.updateWhatsappInstance(id, instanceData);
      
      console.log(`✅ Instance updated: ${id}`, updatedInstance);
      res.json(updatedInstance);
    } catch (error) {
      console.error("Update WhatsApp instance error:", error);
      res.status(500).json({ error: "Erro ao atualizar instância", details: error.message });
    }
  });

  // Endpoint debug temporário - REMOVER APÓS TESTES
  // app.post("/api/debug-noauth/fix-instance", async (req, res) => { ... });

  app.get("/api/whatsapp-instances/:id/qr", (req, res, next) => {
    console.log("ROUTE HIT - QR endpoint called!");
    next();
  }, authenticate, requireClient, async (req: AuthRequest, res) => {
    console.log("=== QR CODE REQUEST DEBUG ===");
    console.log("URL requested:", req.originalUrl);
    console.log("Method:", req.method);
    console.log("Headers:", JSON.stringify({
      authorization: req.headers.authorization ? 'Bearer ***' : 'missing',
      contentType: req.headers['content-type']
    }));
    console.log("User from token:", req.user ? {
      id: req.user.id,
      companyId: req.user.companyId,
      role: req.user.role
    } : 'null');
    
    try {
      const { id } = req.params;
      console.log("QR Code request for instance ID:", id);
      console.log("User company ID:", req.user?.companyId);
      
      if (!req.user?.companyId) {
        console.log("No company ID found for user");
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const instance = await storage.getWhatsappInstance(id);
      console.log("Found instance:", instance ? {
        id: instance.id,
        companyId: instance.companyId,
        name: instance.name
      } : null);
      
      if (!instance) {
        console.log("Instance not found in database");
        return res.status(404).json({ error: "Instância não encontrada" });
      }
      
      // Fix for existing instances without companyId
      if (!instance.companyId && req.user.companyId) {
        console.log("Fixing missing companyId for instance");
        await storage.updateWhatsappInstance(id, { companyId: req.user.companyId });
        instance.companyId = req.user.companyId;
      }
      
      if (instance.companyId !== req.user.companyId) {
        console.log("Company mismatch - Instance:", instance.companyId, "User:", req.user.companyId);
        return res.status(404).json({ error: "Instância não encontrada" });
      }

      const evolutionConfig = await storage.getEvolutionApiConfiguration();
      if (!evolutionConfig) {
        return res.status(404).json({ error: "Configuração Evolution API não encontrada" });
      }

      const evolutionService = new EvolutionApiService({
        baseURL: evolutionConfig.evolutionURL,
        token: evolutionConfig.evolutionToken
      });

      const instanceNameToUse = instance.evolutionInstanceId || instance.name?.replace(/\s+/g, '_').toLowerCase() || instance.id;
      console.log("🔍 Generating QR for instance:", instanceNameToUse);
      console.log("📋 Instance details:", { 
        evolutionInstanceId: instance.evolutionInstanceId, 
        name: instance.name,
        id: instance.id,
        nameToUse: instanceNameToUse
      });
      
      try {
        // First check if instance is already connected
        console.log(`🔍 Checking instance status: ${instanceNameToUse}`);
        const statusResponse = await evolutionService.getInstanceStatus(instanceNameToUse);
        console.log("Status Response from Evolution API:", JSON.stringify(statusResponse, null, 2));
        
        if (statusResponse?.instance?.state === 'open') {
          console.log("⚠️ Instance is already connected, cannot generate QR code");
          return res.status(400).json({ 
            error: "Instância já está conectada",
            details: "Para gerar um novo QR code, primeiro desconecte a instância",
            connected: true
          });
        }
        
        // If not connected, try to get QR Code
        console.log(`📱 Requesting QR Code for disconnected instance: ${instanceNameToUse}`);
        const qrResponse = await evolutionService.generateQRCode(instanceNameToUse);
        console.log("QR Response from Evolution API:", JSON.stringify(qrResponse, null, 2));
        
        // Check if QR code was actually returned
        const qrCodeData = qrResponse.qrcode?.base64 || qrResponse.base64 || qrResponse.qr;
        if (!qrCodeData) {
          console.log("⚠️ No QR code in response, instance may already be connected");
          return res.status(400).json({ 
            error: "QR Code não disponível",
            details: "A instância pode já estar conectada ou em processo de conexão",
            response: qrResponse
          });
        }
        
        // Update instance with QR code
        await storage.updateWhatsappInstance(id, {
          qrCode: qrCodeData
        });

        res.json({ qrCode: qrCodeData });
      } catch (qrError) {
        console.log("❌ QR generation failed, trying recovery steps...");
        console.error("QR Error:", qrError);
        
        const newInstanceName = instance.name?.replace(/\s+/g, '_').toLowerCase() || instance.id;
        
        try {
          // Step 1: Try to list instances to see what exists
          console.log("🔍 Listing all instances...");
          const allInstances = await evolutionService.listInstances();
          console.log("📋 All instances:", JSON.stringify(allInstances, null, 2));
          
          // Step 2: Try to disconnect/logout the instance first
          console.log(`🔌 Trying to disconnect instance: ${instanceNameToUse}`);
          try {
            await evolutionService.disconnectInstance(instanceNameToUse);
            console.log("✅ Instance disconnected successfully");
          } catch (disconnectError) {
            console.log("⚠️  Disconnect failed (instance may not be connected):", disconnectError);
          }
          
          // Step 3: Try to delete the existing instance
          console.log(`🗑️  Trying to delete instance: ${instanceNameToUse}`);
          try {
            await evolutionService.deleteInstance(instanceNameToUse);
            console.log("✅ Instance deleted successfully");
          } catch (deleteError) {
            console.log("⚠️  Delete failed:", deleteError);
          }
          
          // Step 4: Create a fresh instance
          console.log(`🆕 Creating fresh instance: ${newInstanceName}`);
          const evolutionResponse = await evolutionService.createInstance({
            instanceName: newInstanceName,
            qrcode: true
          });
          
          console.log("✅ Fresh instance created:", evolutionResponse);
          
          // Update database with new Evolution instance ID and token
          await storage.updateWhatsappInstance(id, {
            evolutionInstanceId: newInstanceName,
            evolutionToken: evolutionResponse.hash?.apikey || evolutionResponse.apikey
          });
          
          // Step 5: Get QR Code from fresh instance
          console.log(`📱 Getting QR from fresh instance: ${newInstanceName}`);
          const newQrResponse = await evolutionService.generateQRCode(newInstanceName);
          console.log("✅ Fresh QR Response:", JSON.stringify(newQrResponse, null, 2));
          
          res.json({ qrCode: newQrResponse.qrcode?.base64 || newQrResponse.base64 });
        } catch (recoveryError) {
          console.error("❌ All recovery steps failed:", recoveryError);
          res.status(500).json({ 
            error: "Erro ao gerar QR Code. Tente criar uma nova instância.",
            details: "A instância pode estar em um estado inconsistente na Evolution API"
          });
        }
      }
    } catch (error) {
      console.error("Generate QR code error:", error);
      res.status(500).json({ error: "Erro ao gerar QR Code" });
    }
  });

  app.delete("/api/whatsapp-instances/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const instance = await storage.getWhatsappInstance(id);
      
      if (!instance) {
        return res.status(404).json({ error: "Instância não encontrada" });
      }

      // Fix for existing instances without companyId
      if (!instance.companyId && req.user?.companyId) {
        console.log("Fixing missing companyId for delete operation");
        await storage.updateWhatsappInstance(id, { companyId: req.user.companyId });
        instance.companyId = req.user.companyId;
      }
      
      // Check company access manually
      if (instance.companyId !== req.user?.companyId) {
        console.log("Company mismatch for delete - Instance:", instance.companyId, "User:", req.user?.companyId);
        return res.status(404).json({ error: "Instância não encontrada" });
      }

      console.log("Deleting WhatsApp instance:", instance.name, "ID:", instance.id);

      // Delete from Evolution API first
      try {
        const evolutionConfig = await storage.getEvolutionApiConfiguration();
        if (evolutionConfig) {
          const evolutionService = new EvolutionApiService({
            baseURL: evolutionConfig.evolutionURL,
            token: evolutionConfig.evolutionToken
          });

          const instanceNameToDelete = instance.evolutionInstanceId || instance.name;
          console.log("Deleting from Evolution API:", instanceNameToDelete);
          
          // First, list all instances to debug
          const allInstances = await evolutionService.listInstances();
          console.log("All Evolution API instances:", JSON.stringify(allInstances, null, 2));
          
          await evolutionService.deleteInstance(instanceNameToDelete);
          console.log("Successfully deleted from Evolution API");
        }
      } catch (evolutionError) {
        console.error("Evolution API delete error:", evolutionError);
        // Continue with database deletion even if Evolution API fails
      }

      // Delete from database
      await storage.deleteWhatsappInstance(id);
      console.log("Successfully deleted from database");
      
      res.status(204).send();
    } catch (error) {
      console.error("Delete WhatsApp instance error:", error);
      res.status(500).json({ error: "Erro ao excluir instância" });
    }
  });

  // Get connection status for WhatsApp instance
  app.get("/api/whatsapp-instances/:id/status", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const instance = await storage.getWhatsappInstance(id);
      
      if (!instance) {
        return res.status(404).json({ error: "Instância não encontrada" });
      }

      // Fix for existing instances without companyId (similar to other routes)
      if (!instance.companyId && req.user?.companyId) {
        console.log("🔧 Corrigindo companyId ausente para instância");
        await storage.updateWhatsappInstance(id, { companyId: req.user.companyId });
        instance.companyId = req.user.companyId;
      }

      // Fix for existing instances without evolutionInstanceId
      if (!instance.evolutionInstanceId && instance.name) {
        const evolutionInstanceId = instance.name.replace(/\s+/g, '_').toLowerCase();
        console.log(`🔧 Corrigindo evolutionInstanceId ausente automaticamente: ${instance.name} -> ${evolutionInstanceId}`);
        await storage.updateWhatsappInstance(id, { evolutionInstanceId });
        instance.evolutionInstanceId = evolutionInstanceId;
      }

      // Se ainda não tem evolutionInstanceId, não pode verificar status
      if (!instance.evolutionInstanceId) {
        console.log(`⚠️ Instância sem evolutionInstanceId: ${instance.name} - não pode verificar status`);
        return res.status(400).json({ 
          error: "Instância não tem evolutionInstanceId configurado",
          details: "Use o botão 'Corrigir Nomes' para corrigir esta instância"
        });
      }

      // Check company access
      console.log(`🔒 Verificando acesso da empresa:`);
      console.log(`   - User role: ${req.user?.role}`);
      console.log(`   - User companyId: ${req.user?.companyId}`);
      console.log(`   - Instance companyId: ${instance.companyId}`);
      
      if (req.user?.role !== 'admin' && instance.companyId !== req.user?.companyId) {
        console.log(`❌ Acesso negado: companyId não confere`);
        return res.status(403).json({ error: "Acesso negado: instância não pertence à sua empresa" });
      }
      
      console.log(`✅ Acesso liberado para status`);
      

      console.log(`🔍 Buscando status da instância: ${instance.name} (${instance.evolutionInstanceId})`);

      // Get Evolution API configuration
      const evolutionConfig = await storage.getEvolutionApiConfiguration();
      if (!evolutionConfig) {
        return res.status(500).json({ error: "Configuração da Evolution API não encontrada" });
      }

      // Check if instance has evolutionInstanceId
      if (!instance.evolutionInstanceId) {
        console.log(`❌ Instância não tem evolutionInstanceId definido`);
        return res.status(400).json({ error: "Instância não está configurada na Evolution API" });
      }

      // Check connection status from Evolution API
      // CORREÇÃO: Usar o nome da instância se o evolutionInstanceId não funcionar
      let instanceIdentifier = instance.evolutionInstanceId || instance.name;

      // Se o evolutionInstanceId é um UUID mas a Evolution API espera o nome, usar o nome
      if (instance.evolutionInstanceId && instance.evolutionInstanceId.includes('-')) {
        console.log(`⚠️ evolutionInstanceId parece ser UUID (${instance.evolutionInstanceId}), usando nome: ${instance.name}`);
        instanceIdentifier = instance.name;
      }

      const statusUrl = `${evolutionConfig.evolutionURL}/instance/connectionState/${instanceIdentifier}`;
      console.log(`📡 Consultando status em: ${statusUrl}`);
      console.log(`🔍 Usando identificador: ${instanceIdentifier}`);

      const response = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionConfig.evolutionToken,
        },
      });

      if (!response.ok) {
        console.error(`❌ Erro ao buscar status: ${response.status} ${response.statusText}`);
        return res.status(500).json({ 
          error: "Erro ao consultar status na Evolution API",
          details: `${response.status} ${response.statusText}`
        });
      }

      const statusData = await response.json();
      console.log(`✅ Status obtido:`, statusData);

      // Check if instance is connected based on Evolution API response
      const evolutionState = statusData.instance?.state || statusData.state || statusData.status;

      // Mapear todos os possíveis estados da Evolution API
      let isConnected = false;
      if (evolutionState) {
        const connectedStates = ['open', 'connected', 'CONNECTED', 'online'];
        isConnected = connectedStates.includes(evolutionState);
        console.log(`🔍 Estado recebido: "${evolutionState}", Conectado: ${isConnected}`);
      } else {
        console.log(`⚠️ Nenhum estado encontrado na resposta da Evolution API`);
      }

      const newStatus = isConnected ? 'connected' : 'disconnected';
      
      console.log(`🔄 Instance ${instance.name}: Evolution state="${evolutionState}", DB status="${instance.status}", New status="${newStatus}"`);
      
      // Update status in database if it changed
      if (newStatus !== instance.status) {
        console.log(`🔄 Updating ${instance.name} status from "${instance.status}" to "${newStatus}"`);
        await storage.updateWhatsappInstance(instance.id, { status: newStatus });
        // Update instance object for response
        instance.status = newStatus;
      }

      // Return the status data with additional instance info
      res.json({
        ...statusData,
        instance: {
          ...statusData.instance,
          instanceName: instance.name,
          phone: instance.phone,
          serverUrl: evolutionConfig.evolutionURL,
          dbStatus: instance.status // Include updated status from database
        }
      });
    } catch (error) {
      console.error("❌ Erro ao buscar status da instância:", error);
      res.status(500).json({ error: "Erro interno do servidor" });
    }
  });

  // Configure WhatsApp settings
  app.post("/api/whatsapp-instances/:id/settings", authenticate, requireClient, async (req: AuthRequest, res) => {
    console.log("🚀 INÍCIO DA ROTA SETTINGS - ID:", req.params.id);
    try {
      const { id } = req.params;
      console.log("📋 Buscando instância no banco...");
      const instance = await storage.getWhatsappInstance(id);
      
      if (!instance) {
        console.log("❌ Instância não encontrada no banco");
        return res.status(404).json({ error: "Instância não encontrada" });
      }

      console.log(`🔍 DEBUG - Estado da instância antes das correções:`);
      console.log(`   - ID: ${instance.id}`);
      console.log(`   - Name: "${instance.name}"`);
      console.log(`   - CompanyId: "${instance.companyId}"`);
      console.log(`   - EvolutionInstanceId: "${instance.evolutionInstanceId}"`);

      // Fix for existing instances without companyId
      if (!instance.companyId && req.user?.companyId) {
        console.log("🔧 Corrigindo companyId ausente para configuração");
        await storage.updateWhatsappInstance(id, { companyId: req.user.companyId });
        instance.companyId = req.user.companyId;
      }

      // Fix for existing instances without evolutionInstanceId
      if (!instance.evolutionInstanceId && instance.name) {
        const evolutionInstanceId = instance.name.replace(/\s+/g, '_').toLowerCase();
        console.log(`🔧 Corrigindo evolutionInstanceId ausente para configuração: ${evolutionInstanceId}`);
        await storage.updateWhatsappInstance(id, { evolutionInstanceId });
        instance.evolutionInstanceId = evolutionInstanceId;
        console.log(`✅ evolutionInstanceId atualizado para: "${instance.evolutionInstanceId}"`);
      } else if (!instance.evolutionInstanceId) {
        console.log(`❌ Não foi possível corrigir evolutionInstanceId - name: "${instance.name}"`);
      } else {
        console.log(`✅ evolutionInstanceId já existe: "${instance.evolutionInstanceId}"`);
      }

      console.log(`🔍 DEBUG - Estado da instância após correções:`);
      console.log(`   - EvolutionInstanceId: "${instance.evolutionInstanceId}"`);
      console.log(`   - CompanyId: "${instance.companyId}"`);
      console.log(`   - Name: "${instance.name}"`);
      

      // Check company access
      if (req.user?.role !== 'admin' && instance.companyId !== req.user?.companyId) {
        console.log(`❌ Acesso negado para configuração: companyId não confere`);
        return res.status(403).json({ error: "Acesso negado: instância não pertence à sua empresa" });
      }

      // Get Evolution API configuration
      console.log("🔧 Buscando configuração da Evolution API...");
      const evolutionConfig = await storage.getEvolutionApiConfiguration();
      if (!evolutionConfig) {
        console.log("❌ Configuração da Evolution API não encontrada");
        return res.status(500).json({ error: "Configuração da Evolution API não encontrada" });
      }

      // Check if instance has evolutionInstanceId
      if (!instance.evolutionInstanceId) {
        console.log(`❌ Instância AINDA não tem evolutionInstanceId definido para configuração após correções`);
        return res.status(400).json({ error: "Instância não está configurada na Evolution API" });
      }

      const evolutionService = new EvolutionApiService({
        baseURL: evolutionConfig.evolutionURL,
        token: evolutionConfig.evolutionToken
      });

      // Default settings payload
      const settings = {
        rejectCall: true,
        msgCall: "I do not accept calls",
        groupsIgnore: true,
        alwaysOnline: true,
        readMessages: true,
        syncFullHistory: false,
        readStatus: true
      };

      console.log(`⚙️ Configurando settings da instância: ${instance.evolutionInstanceId}`);
      console.log(`📋 Settings:`, JSON.stringify(settings, null, 2));
      
      // First check if instance exists in Evolution API
      try {
        console.log(`🔍 Verificando se instância existe na Evolution API: ${instance.evolutionInstanceId}`);
        // CORREÇÃO: Usar o nome da instância se o evolutionInstanceId for UUID
        let checkInstanceId = instance.evolutionInstanceId;
        if (instance.evolutionInstanceId && instance.evolutionInstanceId.includes('-')) {
          checkInstanceId = instance.name;
        }
        const statusCheck = await evolutionService.getInstanceStatus(checkInstanceId);
        console.log(`✅ Instância encontrada na Evolution API:`, JSON.stringify(statusCheck, null, 2));
      } catch (statusError) {
        console.error(`❌ Instância não encontrada na Evolution API:`, statusError);
        return res.status(400).json({ 
          error: "Instância não encontrada na Evolution API",
          details: `A instância '${instance.evolutionInstanceId}' não existe na Evolution API`
        });
      }
      
      const result = await evolutionService.setSettings(instance.evolutionInstanceId, settings);
      
      console.log("✅ Settings configuradas com sucesso:", JSON.stringify(result, null, 2));
      
      res.json({ success: true, result });
    } catch (error) {
      console.error("❌ Erro ao configurar settings:", error);
      res.status(500).json({ error: "Erro ao configurar WhatsApp" });
    }
  });

  // Configure AI webhook
  app.post("/api/whatsapp-instances/:id/webhook", authenticate, requireClient, async (req: AuthRequest, res) => {
    console.log("🚀 INÍCIO DA ROTA WEBHOOK - ID:", req.params.id);
    try {
      const { id } = req.params;
      const { forceReconfigure } = req.body; // Permite forçar reconfiguração
      console.log("📋 Buscando instância no banco...");
      const instance = await storage.getWhatsappInstance(id);
      
      if (!instance) {
        console.log("❌ Instância não encontrada no banco");
        return res.status(404).json({ error: "Instância não encontrada" });
      }

      console.log(`🔍 DEBUG - Estado da instância para webhook:`);
      console.log(`   - ID: ${instance.id}`);
      console.log(`   - Name: "${instance.name}"`);
      console.log(`   - CompanyId: "${instance.companyId}"`);
      console.log(`   - EvolutionInstanceId: "${instance.evolutionInstanceId}"`);

      // Fix for existing instances without companyId
      if (!instance.companyId && req.user?.companyId) {
        console.log("🔧 Corrigindo companyId ausente para webhook");
        await storage.updateWhatsappInstance(id, { companyId: req.user.companyId });
        instance.companyId = req.user.companyId;
      }

      // Fix for existing instances without evolutionInstanceId
      if (!instance.evolutionInstanceId && instance.name) {
        const evolutionInstanceId = instance.name.replace(/\s+/g, '_').toLowerCase();
        console.log(`🔧 Corrigindo evolutionInstanceId ausente para webhook: ${evolutionInstanceId}`);
        await storage.updateWhatsappInstance(id, { evolutionInstanceId });
        instance.evolutionInstanceId = evolutionInstanceId;
        console.log(`✅ evolutionInstanceId atualizado para: "${instance.evolutionInstanceId}"`);
      }

      // Check company access
      if (req.user?.role !== 'admin' && instance.companyId !== req.user?.companyId) {
        console.log(`❌ Acesso negado para webhook: companyId não confere`);
        return res.status(403).json({ error: "Acesso negado: instância não pertence à sua empresa" });
      }

      // Get Evolution API configuration
      console.log("🔧 Buscando configuração da Evolution API...");
      const evolutionConfig = await storage.getEvolutionApiConfiguration();
      if (!evolutionConfig) {
        console.log("❌ Configuração da Evolution API não encontrada");
        return res.status(500).json({ error: "Configuração da Evolution API não encontrada" });
      }

      // Use configured system URL from admin settings
      console.log("🔧 Buscando URL global do sistema das configurações do administrador...");
      const systemUrl = evolutionConfig.urlGlobalSistema;
      
      if (!systemUrl) {
        console.log("❌ URL global do sistema não configurada pelo administrador");
        return res.status(400).json({ 
          error: "URL global do sistema não configurada", 
          details: "O administrador precisa configurar a URL global do sistema nas configurações da Evolution API" 
        });
      }
      console.log("✅ URL global do sistema encontrada:", systemUrl);

      // Check if instance has evolutionInstanceId
      if (!instance.evolutionInstanceId) {
        console.log(`❌ Instância AINDA não tem evolutionInstanceId definido para webhook após correções`);
        return res.status(400).json({ error: "Instância não está configurada na Evolution API" });
      }

      const evolutionService = new EvolutionApiService({
        baseURL: evolutionConfig.evolutionURL,
        token: evolutionConfig.evolutionToken
      });

      // Default webhook payload - wrapped in webhook property as required by Evolution API
      const webhookUrl = `${systemUrl}/api/webhook/messages`;
      console.log(`🔗 [WEBHOOK] Configurando webhook URL: ${webhookUrl}`);
      const webhook = {
        webhook: {
          enabled: true,
          url: webhookUrl,
          headers: {
            "Content-Type": "application/json"
          },
          byEvents: true,
          base64: true,
          events: [
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE", 
            "MESSAGES_DELETE",
            "SEND_MESSAGE",
            "CHATS_SET",
            "CHATS_UPSERT",
            "CHATS_UPDATE",
            "CHATS_DELETE"
          ]
        }
      };

      console.log(`🤖 Configurando webhook da instância: ${instance.evolutionInstanceId}`);
      console.log(`🌐 URL do webhook: ${webhookUrl}`);
      console.log(`📋 Webhook:`, JSON.stringify(webhook, null, 2));
      
      // First check if instance exists in Evolution API
      try {
        console.log(`🔍 Verificando se instância existe na Evolution API: ${instance.evolutionInstanceId}`);
        // CORREÇÃO: Usar o nome da instância se o evolutionInstanceId for UUID
        let checkInstanceId = instance.evolutionInstanceId;
        if (instance.evolutionInstanceId && instance.evolutionInstanceId.includes('-')) {
          checkInstanceId = instance.name;
        }
        const statusCheck = await evolutionService.getInstanceStatus(checkInstanceId);
        console.log(`✅ Instância encontrada na Evolution API:`, JSON.stringify(statusCheck, null, 2));
      } catch (statusError) {
        console.error(`❌ Instância não encontrada na Evolution API:`, statusError);
        return res.status(400).json({ 
          error: "Instância não encontrada na Evolution API",
          details: `A instância '${instance.evolutionInstanceId}' não existe na Evolution API`
        });
      }
      
      // CORREÇÃO: Usar o nome da instância se o evolutionInstanceId for UUID
      let instanceIdentifier = instance.evolutionInstanceId;
      if (instance.evolutionInstanceId && instance.evolutionInstanceId.includes('-')) {
        console.log(`⚠️ evolutionInstanceId é UUID (${instance.evolutionInstanceId}), usando nome: ${instance.name}`);
        instanceIdentifier = instance.name;
      }

      console.log(`🔧 Configurando webhook para instância: ${instanceIdentifier}`);
      const result = await evolutionService.setWebhook(instanceIdentifier, webhook);
      
      console.log("✅ Webhook configurado com sucesso:", JSON.stringify(result, null, 2));
      
      res.json({ success: true, result });
    } catch (error) {
      console.error("❌ Erro ao configurar webhook:", error);
      res.status(500).json({ error: "Erro ao configurar IA" });
    }
  });

  // Rota para reconfigurar webhook automaticamente
  app.post("/api/reconfigure-webhook/:instanceId", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { instanceId } = req.params;
      console.log(`🔄 Reconfigurando webhook automaticamente para instância: ${instanceId}`);
      
      // Buscar a instância
      const instance = await storage.getWhatsappInstance(instanceId);
      if (!instance) {
        return res.status(404).json({ error: "Instância não encontrada" });
      }

      // Verificar acesso da empresa
      if (req.user?.role !== 'admin' && instance.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      // Buscar configuração da Evolution API
      const evolutionConfig = await storage.getEvolutionApiConfiguration();
      if (!evolutionConfig) {
        return res.status(500).json({ error: "Configuração da Evolution API não encontrada" });
      }

      // Usar URL global do sistema ou URL atual do Replit
      let systemUrl = evolutionConfig.urlGlobalSistema;
      if (!systemUrl && process.env.REPLIT_DEV_DOMAIN) {
        systemUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
      }

      if (!systemUrl) {
        return res.status(400).json({ error: "URL do sistema não configurada" });
      }

      const evolutionService = new EvolutionApiService({
        baseURL: evolutionConfig.evolutionURL,
        token: evolutionConfig.evolutionToken
      });

      const webhookUrl = `${systemUrl}/api/webhook/messages`;
      console.log(`🔗 [WEBHOOK] Configurando webhook URL: ${webhookUrl}`);
      const webhook = {
        webhook: {
          enabled: true,
          url: webhookUrl,
          headers: {
            "Content-Type": "application/json"
          },
          byEvents: true,
          base64: true,
          events: [
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE", 
            "MESSAGES_DELETE",
            "SEND_MESSAGE",
            "CHATS_SET",
            "CHATS_UPSERT",
            "CHATS_UPDATE",
            "CHATS_DELETE"
          ]
        }
      };

      console.log(`🔧 Reconfigurando webhook para: ${webhookUrl}`);
      // CORREÇÃO: Usar o nome da instância se o evolutionInstanceId for UUID
      let instanceIdentifier = instance.evolutionInstanceId;
      if (instance.evolutionInstanceId && instance.evolutionInstanceId.includes('-')) {
        console.log(`⚠️ evolutionInstanceId é UUID (${instance.evolutionInstanceId}), usando nome: ${instance.name}`);
        instanceIdentifier = instance.name;
      }

      console.log(`🔧 Configurando webhook para instância: ${instanceIdentifier}`);
      const result = await evolutionService.setWebhook(instanceIdentifier, webhook);
      
      console.log("✅ Webhook reconfigurado com sucesso:", JSON.stringify(result, null, 2));
      res.json({ success: true, webhookUrl, result });
      
    } catch (error) {
      console.error("❌ Erro ao reconfigurar webhook:", error);
      res.status(500).json({ error: "Erro ao reconfigurar webhook" });
    }
  });


  // Conversations with agent tracking routes
  app.get('/api/conversations/by-instance/:instanceId', authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { instanceId } = req.params;
      
      const conversations = await storage.getConversationsByInstance(instanceId);
      res.json(conversations);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  app.get('/api/conversations/:conversationId/messages-with-agents', authenticate, requireClient, async (req, res) => {
    try {
      const { conversationId } = req.params;
      
      // Buscar mensagens com informações dos agentes
      const messages = await storage.getMessagesByConversation(conversationId);
      
      // Para cada mensagem de AI, buscar informações do agente
      const messagesWithAgents = await Promise.all(
        messages.map(async (message) => {
          if (message.sender === 'assistant' && message.agentId) {
            try {
              const agent = await storage.getAiAgent(message.agentId);
              return {
                ...message,
                agent: agent ? {
                  id: agent.id,
                  name: agent.name,
                  agentType: agent.agentType || 'main',
                  specialization: agent.specialization
                } : null
              };
            } catch (error) {
              console.error(`Error fetching agent ${message.agentId}:`, error);
              return { ...message, agent: null };
            }
          }
          return { ...message, agent: null };
        })
      );
      
      res.json(messagesWithAgents);
    } catch (error) {
      console.error('Error fetching messages with agents:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  app.get('/api/agents/usage-stats', authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const user = req.user;
      if (!user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }
      
      console.log(`🔍 [DEBUG] Buscando stats para empresa: ${user.companyId}`);
      
      // Buscar todas as instâncias da empresa
      const instances = await storage.getWhatsappInstancesByCompany(user.companyId);
      console.log(`🔍 [DEBUG] Instâncias encontradas: ${instances.length}`, instances.map(i => ({ id: i.id, name: i.name })));
      
      let totalStats: any = {};
      let totalMessages = 0;
      let assistantMessages = 0;
      let messagesWithAgent = 0;
      
      for (const instance of instances) {
        // Buscar conversas da instância
        const conversations = await storage.getConversationsByInstance(instance.id);
        console.log(`🔍 [DEBUG] Conversas para instância ${instance.name}: ${conversations.length}`);
        
        for (const conversation of conversations) {
          // Buscar mensagens da conversa
          const messages = await storage.getMessagesByConversation(conversation.id);
          console.log(`🔍 [DEBUG] Mensagens na conversa ${conversation.id}: ${messages.length}`);
          totalMessages += messages.length;
          
          // Contar uso de agentes
          for (const message of messages) {
            if (message.sender === 'assistant') {
              assistantMessages++;
              console.log(`🔍 [DEBUG] Mensagem assistant encontrada - AgentId: ${message.agentId}, Content: ${message.content?.substring(0, 50)}...`);
              
              if (message.agentId) {
                messagesWithAgent++;
                try {
                  const agent = await storage.getAiAgent(message.agentId);
                  if (agent) {
                    const agentKey = `${agent.id}|${agent.name}|${agent.agentType || 'main'}`;
                    if (!totalStats[agentKey]) {
                      totalStats[agentKey] = {
                        agentId: agent.id,
                        agentName: agent.name,
                        agentType: agent.agentType || 'main',
                        specialization: agent.specialization,
                        messageCount: 0,
                        conversationCount: new Set()
                      };
                    }
                    totalStats[agentKey].messageCount++;
                    totalStats[agentKey].conversationCount.add(conversation.id);
                  }
                } catch (error) {
                  console.error(`Error processing agent ${message.agentId}:`, error);
                }
              }
            }
          }
        }
      }
      
      console.log(`🔍 [DEBUG] Totais: ${totalMessages} mensagens, ${assistantMessages} de assistant, ${messagesWithAgent} com agentId`);
      console.log(`🔍 [DEBUG] Stats processadas:`, Object.keys(totalStats).length, 'agentes');
      
      // DEBUG: Contar diretamente via MySQL todas as mensagens com agentId
      try {
        console.log(`🔍 [DEBUG EXTRA] Contando mensagens com agentId diretamente no MySQL...`);
        const storageInstance = storage as any; // Cast para acessar connection
        if (storageInstance.connection) {
          const [countRows] = await storageInstance.connection.execute(
            'SELECT COUNT(*) as total FROM messages WHERE sender = ? AND agent_id IS NOT NULL',
            ['assistant']
          );
          const totalWithAgentId = (countRows as any[])[0].total;
          console.log(`🔍 [DEBUG EXTRA] Total de mensagens assistant com agentId no MySQL: ${totalWithAgentId}`);
          
          if (totalWithAgentId > 0) {
            const [sampleRows] = await storageInstance.connection.execute(
              'SELECT agent_id, content, conversation_id FROM messages WHERE sender = ? AND agent_id IS NOT NULL LIMIT 5',
              ['assistant']
            );
            console.log(`🔍 [DEBUG EXTRA] Exemplos de mensagens com agentId:`, sampleRows);
          }
        }
      } catch (error) {
        console.error(`🔍 [DEBUG EXTRA] Erro ao contar mensagens:`, error);
      }
      
      // Converter Sets em contadores
      const stats = Object.values(totalStats).map((stat: any) => ({
        ...stat,
        conversationCount: stat.conversationCount.size
      }));
      
      res.json(stats);
    } catch (error) {
      console.error('Error fetching agent usage stats:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // AI Agents
  app.get("/api/ai-agents", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const agents = await storage.getAiAgentsByCompany(req.user.companyId);
      res.json(agents);
    } catch (error) {
      console.error("Get AI agents error:", error);
      res.status(500).json({ error: "Erro ao buscar agentes" });
    }
  });

  // Get main agents only
  app.get("/api/ai-agents/main", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const mainAgents = await storage.getMainAgentsByCompany(req.user.companyId);
      res.json(mainAgents);
    } catch (error) {
      console.error("Get main AI agents error:", error);
      res.status(500).json({ error: "Erro ao buscar agentes principais" });
    }
  });

  // Get secondary agents by parent
  app.get("/api/ai-agents/:parentId/secondary", authenticate, requireClient, requireCompanyAccess, async (req, res) => {
    try {
      const { parentId } = req.params;
      const secondaryAgents = await storage.getSecondaryAgentsByParent(parentId);
      res.json(secondaryAgents);
    } catch (error) {
      console.error("Get secondary AI agents error:", error);
      res.status(500).json({ error: "Erro ao buscar agentes secundários" });
    }
  });

  // Get all secondary agents for company
  app.get("/api/ai-agents/secondary", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const secondaryAgents = await storage.getSecondaryAgentsByCompany(req.user.companyId);
      res.json(secondaryAgents);
    } catch (error) {
      console.error("Get secondary AI agents error:", error);
      res.status(500).json({ error: "Erro ao buscar agentes secundários" });
    }
  });

  app.post("/api/ai-agents", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const agentData = insertAiAgentSchema.parse({
        ...req.body,
        companyId: req.user.companyId
      });

      // Process PDFs if training files are provided
      let trainingContent = '';
      if (agentData.trainingFiles && Array.isArray(agentData.trainingFiles) && agentData.trainingFiles.length > 0) {
        try {
          console.log(`🤖 Processando ${agentData.trainingFiles.length} PDFs para o agente: ${agentData.name}`);
          trainingContent = await extractTextFromMultiplePDFs(agentData.trainingFiles);
          console.log(`✅ Conteúdo extraído com sucesso para o agente: ${agentData.name}`);
        } catch (pdfError) {
          console.error('❌ Erro ao processar PDFs:', pdfError);
          // Continue without training content but log the error
          trainingContent = `Erro ao processar PDFs: ${pdfError.message}`;
        }
      }

      const agentWithContent = {
        ...agentData,
        trainingContent
      };

      const agent = await storage.createAiAgent(agentWithContent);
      res.status(201).json(agent);
    } catch (error) {
      console.error("Create AI agent error:", error);
      res.status(500).json({ error: "Erro ao criar agente" });
    }
  });

  app.put("/api/ai-agents/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const agentData = insertAiAgentSchema.partial().parse(req.body);

      // Check if agent exists and belongs to user's company
      const existingAgent = await storage.getAiAgent(id);
      if (!existingAgent) {
        return res.status(404).json({ error: "Agente não encontrado" });
      }
      if (req.user?.role !== 'admin' && existingAgent.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado: não é possível acessar dados de outra empresa" });
      }

      // Process PDFs if training files are updated
      let updateData = { ...agentData };
      if (agentData.trainingFiles && Array.isArray(agentData.trainingFiles)) {
        try {
          console.log(`🤖 Atualizando PDFs para o agente ID: ${id}`);
          const trainingContent = await extractTextFromMultiplePDFs(agentData.trainingFiles);
          updateData.trainingContent = trainingContent;
          console.log(`✅ Conteúdo atualizado com sucesso para o agente ID: ${id}`);
        } catch (pdfError) {
          console.error('❌ Erro ao processar PDFs na atualização:', pdfError);
          updateData.trainingContent = `Erro ao processar PDFs: ${pdfError.message}`;
        }
      }

      const agent = await storage.updateAiAgent(id, updateData);
      res.json(agent);
    } catch (error) {
      console.error("Update AI agent error:", error);
      res.status(500).json({ error: "Erro ao atualizar agente" });
    }
  });

  app.delete("/api/ai-agents/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      
      // Check if agent exists and belongs to user's company
      const existingAgent = await storage.getAiAgent(id);
      if (!existingAgent) {
        return res.status(404).json({ error: "Agente não encontrado" });
      }
      if (req.user?.role !== 'admin' && existingAgent.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado: não é possível acessar dados de outra empresa" });
      }

      await storage.deleteAiAgent(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete AI agent error:", error);
      res.status(500).json({ error: "Erro ao excluir agente" });
    }
  });

  // Generate AI agent response
  app.post("/api/ai-agents/:id/chat", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Mensagem é obrigatória" });
      }

      // Get agent data
      const agent = await storage.getAiAgent(id);
      if (!agent) {
        return res.status(404).json({ error: "Agente não encontrado" });
      }

      // Check company access
      if (req.user?.role !== 'admin' && agent.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado: não é possível acessar dados de outra empresa" });
      }

      // Get AI configuration
      const aiConfig = await storage.getAiConfiguration();
      if (!aiConfig || !aiConfig.apiKey) {
        return res.status(404).json({ error: "Configuração de IA não encontrada" });
      }

      // Create AI response service
      const aiResponseService = new AiResponseService(aiConfig.apiKey);

      // Generate response using agent's prompt and training content with hierarchy support
      const response = await aiResponseService.generateResponse({
        message,
        agentId: agent.id,
        agentPrompt: agent.prompt,
        agentTrainingContent: agent.trainingContent || undefined,
        temperatura: Number(agent.temperatura) || Number(aiConfig.temperatura) || 0.7,
        modelo: agent.modelo || aiConfig.modelo || "gpt-4o",
        numeroTokens: Number(agent.numeroTokens) || Number(aiConfig.numeroTokens) || 1000,
        agentType: (agent.agentType as "main" | "secondary") || 'main',
        delegationKeywords: Array.isArray(agent.delegationKeywords) ? agent.delegationKeywords : [],
        companyId: agent.companyId,
      });

      res.json({ response });
    } catch (error) {
      console.error("AI agent chat error:", error);
      res.status(500).json({ error: "Erro ao gerar resposta" });
    }
  });

  // Test AI agent
  app.post("/api/ai-agents/:id/test", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      // Get agent data
      const agent = await storage.getAiAgent(id);
      if (!agent) {
        return res.status(404).json({ error: "Agente não encontrado" });
      }

      // Check company access
      if (req.user?.role !== 'admin' && agent.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado: não é possível acessar dados de outra empresa" });
      }

      // Get AI configuration
      const aiConfig = await storage.getAiConfiguration();
      if (!aiConfig || !aiConfig.apiKey) {
        return res.status(404).json({ error: "Configuração de IA não encontrada" });
      }

      // Create AI response service
      const aiResponseService = new AiResponseService(aiConfig.apiKey);

      // Test agent
      const testResult = await aiResponseService.testAgent({
        agentId: agent.id,
        agentPrompt: agent.prompt,
        agentTrainingContent: agent.trainingContent || undefined,
        temperatura: Number(agent.temperatura) || Number(aiConfig.temperatura) || 0.7,
        modelo: agent.modelo || aiConfig.modelo || "gpt-4o",
        numeroTokens: Number(agent.numeroTokens) || Number(aiConfig.numeroTokens) || 1000,
      });

      res.json(testResult);
    } catch (error) {
      console.error("AI agent test error:", error);
      res.status(500).json({ error: "Erro ao testar agente" });
    }
  });


  // Criar instância via Evolution API
  app.post("/api/whatsapp-instances/create-evolution", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const { name, phone } = req.body;
      
      if (!name || !phone) {
        return res.status(400).json({ error: "Nome e telefone são obrigatórios" });
      }

      // Check if instance with same name already exists for this company
      const existingInstances = await storage.getWhatsappInstancesByCompany(req.user.companyId);
      const nameExists = existingInstances.some(instance => 
        instance.name.toLowerCase() === name.toLowerCase()
      );
      
      if (nameExists) {
        return res.status(400).json({ 
          error: "Já existe uma instância com este nome",
          details: "Escolha um nome diferente para a instância"
        });
      }

      // Buscar configurações da Evolution API
      const evolutionConfig = await storage.getEvolutionApiConfiguration();
      if (!evolutionConfig || !evolutionConfig.evolutionURL || !evolutionConfig.evolutionToken) {
        return res.status(404).json({ error: "Configurações da Evolution API não encontradas" });
      }

      // Criar instância na Evolution API
      const evolutionService = new EvolutionApiService({
        baseURL: evolutionConfig.evolutionURL,
        token: evolutionConfig.evolutionToken
      });

      // Nome da instância será exatamente igual ao nome fornecido (sem timestamp)
      const instanceName = name.replace(/\s+/g, '_').toLowerCase();
      
      console.log(`🚀 Creating Evolution instance with name: ${instanceName}`);
      
      // Primeiro tenta deletar se já existir (para evitar conflitos)
      try {
        await evolutionService.deleteInstance(instanceName);
        console.log(`🗑️ Instância antiga ${instanceName} deletada`);
      } catch (deleteError) {
        console.log(`ℹ️ Instância ${instanceName} não existia (normal para nova instância)`);
      }
      
      const evolutionResponse = await evolutionService.createInstance({
        instanceName
      });

      // Salvar instância no banco de dados local com o token da instância
      const instanceData = {
        name, // Nome original sem timestamp 
        phone,
        companyId: req.user.companyId,
        evolutionInstanceId: name.replace(/\s+/g, '_').toLowerCase(), // Mesmo nome sem timestamp
        evolutionToken: evolutionResponse.hash?.apikey || evolutionResponse.apikey,
        status: 'disconnected' as const
      };
      
      console.log(`💾 DADOS SENDO SALVOS NO BANCO:`);
      console.log(`  - name (display): "${name}"`);
      console.log(`  - evolutionInstanceId (DB): "${name.replace(/\s+/g, '_').toLowerCase()}"`);
      console.log(`  - evolutionAPIName (API): "${instanceName}" (IGUAL AO DB - SEM TIMESTAMP)`);
      console.log(`  - phone: "${phone}"`);
      console.log(`  - companyId: "${req.user.companyId}"`);
      
      const savedInstance = await storage.createWhatsappInstance(instanceData);
      
      console.log(`✅ INSTÂNCIA SALVA NO BANCO:`);
      console.log(`  - id: ${savedInstance.id}`);
      console.log(`  - name: "${savedInstance.name}"`);
      console.log(`  - evolutionInstanceId: "${savedInstance.evolutionInstanceId}"`);
      console.log(`  - phone: "${savedInstance.phone}"`);
      
      res.json({
        success: true,
        instance: savedInstance,
        evolutionResponse,
        message: "Instância criada com sucesso na Evolution API!"
      });
    } catch (error) {
      console.error("Create evolution instance error:", error);
      res.status(500).json({ 
        error: "Erro ao criar instância na Evolution API",
        details: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  });

  // Link AI agent to WhatsApp instance
  app.post("/api/whatsapp-instances/:instanceId/link-agent", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { instanceId } = req.params;
      const { agentId } = req.body;

      // Verificar se a instância pertence à empresa do usuário
      const instance = await storage.getWhatsappInstance(instanceId);
      if (!instance) {
        return res.status(404).json({ error: "Instância não encontrada" });
      }

      if (req.user?.role !== 'admin' && instance.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado: não é possível acessar dados de outra empresa" });
      }

      // Verificar se o agente pertence à empresa do usuário
      const agent = await storage.getAiAgent(agentId);
      if (!agent) {
        return res.status(404).json({ error: "Agente não encontrado" });
      }

      if (req.user?.role !== 'admin' && agent.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado: agente não pertence à sua empresa" });
      }

      const updatedInstance = await storage.updateWhatsappInstance(instanceId, {
        aiAgentId: agentId
      });

      // Configurar webhook automaticamente quando vincular agente IA
      try {
        const globalConfig = await storage.getGlobalConfig();
        const evolutionConfig = await storage.getEvolutionApiConfiguration();
        
        if (globalConfig?.urlGlobalSistema && evolutionConfig && instance.evolutionInstanceId) {
          const evolutionService = new EvolutionApiService({
            baseURL: evolutionConfig.evolutionURL,
            token: evolutionConfig.evolutionToken
          });

          const webhookUrl = `${globalConfig.urlGlobalSistema}/api/webhook/messages`;
          const webhook = {
            webhook: {
              enabled: true,
              url: webhookUrl,
              headers: {
                "Content-Type": "application/json"
              },
              byEvents: true,
              base64: true,
              events: [
                "MESSAGES_UPSERT",
                "MESSAGE_UPSERT", 
                "MESSAGES_UPDATE", 
                "MESSAGES_DELETE",
                "SEND_MESSAGE",
                "CHATS_SET",
                "CHATS_UPSERT",
                "CHATS_UPDATE",
                "CHATS_DELETE"
              ]
            }
          };

          // CORREÇÃO: Usar o nome da instância se o evolutionInstanceId for UUID
          let webhookInstanceId = instance.evolutionInstanceId;
          if (instance.evolutionInstanceId && instance.evolutionInstanceId.includes('-')) {
            console.log(`⚠️ Webhook: usando nome ${instance.name} em vez de UUID`);
            webhookInstanceId = instance.name;
          }
          await evolutionService.setWebhook(webhookInstanceId, webhook);
          console.log(`✅ Webhook configurado automaticamente para instância: ${instance.evolutionInstanceId} (URL: ${webhookUrl})`);
        }
      } catch (webhookError) {
        console.error("⚠️ Erro ao configurar webhook (não crítico):", webhookError);
      }

      res.json(updatedInstance);
    } catch (error) {
      console.error("Link agent error:", error);
      res.status(500).json({ error: "Erro ao vincular agente" });
    }
  });

  // Unlink AI agent from WhatsApp instance
  app.post("/api/whatsapp-instances/:instanceId/unlink-agent", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { instanceId } = req.params;

      // Verificar se a instância pertence à empresa do usuário
      const instance = await storage.getWhatsappInstance(instanceId);
      if (!instance) {
        return res.status(404).json({ error: "Instância não encontrada" });
      }

      if (req.user?.role !== 'admin' && instance.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado: não é possível acessar dados de outra empresa" });
      }

      const updatedInstance = await storage.updateWhatsappInstance(instanceId, {
        aiAgentId: null
      });

      res.json(updatedInstance);
    } catch (error) {
      console.error("Unlink agent error:", error);
      res.status(500).json({ error: "Erro ao remover vinculação" });
    }
  });

  // Get WebShare proxies
  app.get("/api/whatsapp/proxy/list", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      console.log("🌐 Buscando proxies WebShare...");
      
      // Get global configuration to retrieve WebShare token
      const globalConfig = await storage.getGlobalConfiguration();
      if (!globalConfig?.webshare_token) {
        console.log("❌ Token WebShare não configurado");
        return res.status(400).json({ error: "Token WebShare não configurado no sistema" });
      }

      // Get query parameters for WebShare API
      const { 
        mode = 'direct',
        page = 1, 
        page_size = 25,
        country_code__in,
        search,
        ordering 
      } = req.query;

      // Build WebShare API URL
      const params = new URLSearchParams({
        mode: mode as string,
        page: page.toString(),
        page_size: page_size.toString(),
      });

      if (country_code__in) params.append('country_code__in', country_code__in as string);
      if (search) params.append('search', search as string);
      if (ordering) params.append('ordering', ordering as string);

      const webshareUrl = `https://proxy.webshare.io/api/v2/proxy/list/?${params.toString()}`;
      
      console.log("📡 Consultando WebShare API:", webshareUrl);

      // Make request to WebShare API
      const response = await fetch(webshareUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${globalConfig.webshare_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`❌ Erro WebShare API: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error("Erro detalhes:", errorText);
        return res.status(response.status).json({ 
          error: "Erro ao consultar WebShare API",
          details: errorText
        });
      }

      const proxies = await response.json();
      console.log(`✅ ${proxies.results?.length || 0} proxies obtidos`);

      res.json(proxies);
    } catch (error) {
      console.error("Get WebShare proxies error:", error);
      res.status(500).json({ error: "Erro ao buscar proxies" });
    }
  });

  // Debug endpoint para verificar webhook na Evolution API (TEMPORÁRIO - REMOVER EM PRODUÇÃO)
  app.get("/api/debug/webhook/:instanceName", async (req, res) => {
    try {
      const { instanceName } = req.params;
      const storage = getStorage();
      const evolutionConfig = await storage.getEvolutionApiConfiguration();

      if (!evolutionConfig) {
        return res.status(500).json({ error: "Evolution API não configurada" });
      }

      const evolutionService = new EvolutionApiService({
        baseURL: evolutionConfig.evolutionURL,
        token: evolutionConfig.evolutionToken
      });

      // Buscar configuração do webhook
      const webhookConfig = await evolutionService.makeRequest(`/webhook/find/${instanceName}`, 'GET');

      res.json({
        instanceName,
        webhookConfig,
        expectedUrl: `${process.env.BASE_URL || 'https://imobiliaria.gilliard.dev.br'}/api/webhook/messages`,
        note: "Verifique se a URL do webhook está configurada corretamente"
      });
    } catch (error: any) {
      console.error("Debug webhook error:", error);
      res.status(500).json({
        error: "Erro ao buscar configuração do webhook",
        details: error.message
      });
    }
  });

  // Endpoint para testar o fluxo completo de mensagem
  app.post("/api/debug/test-message/:instanceName", async (req, res) => {
    try {
      const { instanceName } = req.params;
      const { phone, message } = req.body;

      if (!phone || !message) {
        return res.status(400).json({ error: "Phone and message are required" });
      }

      console.log(`🧪 [TEST] Testing complete message flow for ${instanceName}`);
      console.log(`🧪 [TEST] Phone: ${phone}, Message: "${message}"`);

      // Simular mensagem recebida
      const testWebhookData = {
        data: {
          key: {
            remoteJid: `${phone}@s.whatsapp.net`,
            fromMe: false,
            id: `test-${Date.now()}`
          },
          message: {
            conversation: message
          },
          messageType: "conversation",
          instanceId: instanceName,
          pushName: "Test User"
        },
        sender: instanceName,
        destination: "test",
        date_time: new Date().toISOString(),
        server_url: "test",
        apikey: "test"
      };

      const { whatsappWebhookService } = await import("./services/whatsappWebhook");
      await whatsappWebhookService.handleEvolutionMessage(testWebhookData);

      res.json({
        success: true,
        message: "Test message processed",
        testData: testWebhookData
      });
    } catch (error: any) {
      console.error("Test message error:", error);
      res.status(500).json({
        error: "Erro ao testar mensagem",
        details: error.message
      });
    }
  });

  // Endpoint temporário para atualizar URL global do sistema
  app.post("/api/debug/update-system-url", async (req, res) => {
    try {
      const storage = getStorage();
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({ error: "URL é obrigatória" });
      }

      console.log(`🔧 [UPDATE-URL] Atualizando URL global do sistema para: ${url}`);

      // Update the global config with the new URL
      await storage.connection?.execute(
        'UPDATE global_config SET url_global_sistema = ? WHERE id IS NOT NULL',
        [url]
      );

      res.json({
        success: true,
        message: "URL global do sistema atualizada",
        newUrl: url
      });
    } catch (error: any) {
      console.error("Update URL error:", error);
      res.status(500).json({
        error: "Erro ao atualizar URL",
        details: error.message
      });
    }
  });

  // Endpoint para forçar configuração correta do webhook
  app.post("/api/debug/fix-webhook/:instanceName", async (req, res) => {
    try {
      const { instanceName } = req.params;
      const storage = getStorage();
      const evolutionConfig = await storage.getEvolutionApiConfiguration();

      if (!evolutionConfig) {
        return res.status(500).json({ error: "Evolution API não configurada" });
      }

      const evolutionService = new EvolutionApiService({
        baseURL: evolutionConfig.evolutionURL,
        token: evolutionConfig.evolutionToken
      });

      // FORÇAR URL CORRETA DIRETAMENTE
      const systemUrl = 'https://imobiliaria.gilliard.dev.br';
      const webhookUrl = `${systemUrl}/api/webhook/messages`;

      console.log(`🔧 [FIX-WEBHOOK] USANDO URL FORÇADA: ${systemUrl}`);

      console.log(`🔧 [FIX-WEBHOOK] Configurando webhook para ${instanceName}:`);
      console.log(`🔧 [FIX-WEBHOOK] URL: ${webhookUrl}`);

      const webhook = {
        webhook: {
          enabled: true,
          url: webhookUrl,
          headers: {
            "Content-Type": "application/json"
          },
          byEvents: true,
          base64: true,
          events: [
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE",
            "MESSAGES_DELETE",
            "SEND_MESSAGE",
            "CHATS_SET",
            "CHATS_UPSERT",
            "CHATS_UPDATE",
            "CHATS_DELETE"
          ]
        }
      };

      console.log(`🔧 [FIX-WEBHOOK] Webhook config:`, JSON.stringify(webhook, null, 2));

      console.log(`🔧 Configurando webhook para ${instanceName}: ${webhookUrl}`);
      const result = await evolutionService.setWebhook(instanceName, webhook);

      res.json({
        success: true,
        instanceName,
        webhookUrl,
        result,
        note: "Webhook configurado com sucesso!"
      });
    } catch (error: any) {
      console.error("Fix webhook error:", error);
      res.status(500).json({
        error: "Erro ao configurar webhook",
        details: error.message
      });
    }
  });

  // Debug endpoint para verificar instâncias (TEMPORÁRIO - REMOVER EM PRODUÇÃO)
  app.get("/api/debug/instances", async (req, res) => {
    try {
      const storage = getStorage();
      const companies = await storage.getAllCompanies();
      const result: any[] = [];

      for (const company of companies) {
        const instances = await storage.getWhatsappInstancesByCompany(company.id);
        for (const instance of instances) {
          // Buscar informações do agente se vinculado
          let agentInfo = null;
          if (instance.aiAgentId) {
            try {
              const agent = await storage.getAiAgent(instance.aiAgentId);
              agentInfo = agent ? {
                id: agent.id,
                name: agent.name,
                agentType: agent.agentType,
                hasOpenAIKey: !!agent.openaiApiKey,
                hasPrompt: !!agent.prompt
              } : 'AGENT_NOT_FOUND';
            } catch (error) {
              agentInfo = 'AGENT_ERROR';
            }
          }

          result.push({
            companyName: company.name,
            instanceName: instance.name,
            instanceId: instance.id,
            evolutionInstanceId: instance.evolutionInstanceId,
            aiAgentId: instance.aiAgentId,
            agentInfo,
            status: instance.status
          });
        }
      }

      res.json({
        totalInstances: result.length,
        instances: result,
        deployimoFound: result.find(i => i.instanceName === "deployimo"),
        hasAgentConfigured: result.some(i => i.aiAgentId && i.agentInfo && i.agentInfo !== 'AGENT_NOT_FOUND')
      });
    } catch (error) {
      console.error("Debug endpoint error:", error);
      res.status(500).json({ error: "Erro ao buscar instâncias" });
    }
  });

  // WhatsApp Webhook para receber mensagens (Evolution API)
  app.post("/webhook/whatsapp", async (req, res) => {
    try {
      const { whatsappWebhookService } = await import("./services/whatsappWebhook");
      await whatsappWebhookService.handleMessage(req.body);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).json({ error: "Erro ao processar webhook" });
    }
  });

  // Endpoint de teste para verificar conectividade do webhook
  app.get("/api/webhook/messages", (req, res) => {
    console.log("🧪 [WEBHOOK TEST] GET request received - Evolution API can reach the webhook!");
    console.log("🧪 [WEBHOOK TEST] Headers:", JSON.stringify(req.headers, null, 2));
    res.json({
      status: "OK",
      message: "Webhook endpoint is reachable",
      timestamp: new Date().toISOString()
    });
  });

  // Webhook principal para TODAS as mensagens da Evolution API
  app.post("/api/webhook/messages", async (req, res) => {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);

    try {
      console.log("🔥🔥🔥 [WEBHOOK PRINCIPAL] ================================");
      console.log(`🔥🔥🔥 [WEBHOOK-${requestId}] NEW MESSAGE RECEIVED!`);
      console.log(`🔥🔥🔥 [WEBHOOK-${requestId}] REQUEST PATH:`, req.path);
      console.log(`🔥🔥🔥 [WEBHOOK-${requestId}] REQUEST METHOD:`, req.method);
      console.log(`🔥🔥🔥 [WEBHOOK-${requestId}] REQUEST IP:`, req.ip);
      console.log(`🔥🔥🔥 [WEBHOOK-${requestId}] USER AGENT:`, req.headers['user-agent']);
      console.log(`🔥🔥🔥 [WEBHOOK-${requestId}] CONTENT TYPE:`, req.headers['content-type']);
      console.log(`🔥🔥🔥 [WEBHOOK-${requestId}] BODY SIZE:`, JSON.stringify(req.body).length);
      console.log(`📋 [WEBHOOK-${requestId}] FULL BODY:`, JSON.stringify(req.body, null, 2));
      console.log("🔥🔥🔥 [WEBHOOK PRINCIPAL] ================================");

      // Verificar tipo de evento - processar apenas MESSAGES_UPSERT
      const eventType = req.body.event;
      console.log(`🎯 [WEBHOOK-${requestId}] Event type detected: ${eventType}`);

      // Aceitar múltiplos formatos de evento MESSAGES_UPSERT
      const validEvents = ['messages.upsert', 'MESSAGES_UPSERT', 'messages_upsert', 'MESSAGES.UPSERT'];
      if (!validEvents.includes(eventType)) {
        console.log(`⏭️ [WEBHOOK-${requestId}] Ignoring event type: ${eventType}`);
        return res.status(200).json({
          success: true,
          processed: false,
          ignored: true,
          reason: `Event type ${eventType} not processed`,
          requestId
        });
      }

      // Verificar se não é mensagem enviada por nós (evitar loop)
      const fromMe = req.body.data?.key?.fromMe || req.body.data?.fromMe;
      console.log(`👤 [WEBHOOK-${requestId}] FromMe: ${fromMe}`);

      if (fromMe === true) {
        console.log(`📤 [WEBHOOK-${requestId}] Message sent by us, ignoring to prevent loop`);
        return res.status(200).json({
          success: true,
          processed: false,
          ignored: true,
          reason: "Message sent by us",
          requestId
        });
      }

      // VERIFICAR DUPLICAÇÃO: usar ID da mensagem para evitar processamento duplo
      const messageId = req.body.data?.key?.id;
      if (messageId) {
        if (processedMessagesCache.has(messageId)) {
          console.log(`⏭️ [WEBHOOK-${requestId}] Mensagem já processada (ID: ${messageId}), ignorando duplicata`);
          return res.status(200).json({
            success: true,
            processed: false,
            ignored: true,
            reason: "Message already processed (duplicate)",
            requestId
          });
        }
        // Marcar como processada
        processedMessagesCache.set(messageId, Date.now());
        console.log(`🆔 [WEBHOOK-${requestId}] Mensagem registrada no cache: ${messageId}`);
      }

      console.log(`⏱️ [WEBHOOK-${requestId}] Starting message processing...`);
      const { whatsappWebhookService } = await import("./services/whatsappWebhook");
      await whatsappWebhookService.handleEvolutionMessage(req.body);

      const processingTime = Date.now() - startTime;
      console.log(`✅ [WEBHOOK-${requestId}] Message processed successfully in ${processingTime}ms`);
      res.status(200).json({ success: true, processed: true, requestId, processingTime });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ [WEBHOOK-${requestId}] CRITICAL ERROR after ${processingTime}ms:`, error);
      console.error(`❌ [WEBHOOK-${requestId}] ERROR STACK:`, error.stack);
      console.error(`❌ [WEBHOOK-${requestId}] ERROR MESSAGE:`, error.message);
      res.status(200).json({ success: true, processed: false, error: error.message, requestId });
    }
  });

  // Endpoints específicos para eventos da Evolution API
  app.post("/api/webhook/messages/messages-upsert", async (req, res) => {
    try {
      console.log("🔥🔥🔥 [MESSAGES-UPSERT] ================================");
      console.log("🔥🔥🔥 [MESSAGES-UPSERT] NEW MESSAGE IN UPSERT ENDPOINT!");
      console.log("🔥🔥🔥 [MESSAGES-UPSERT] REQUEST FROM IP:", req.ip);
      console.log("🔥🔥🔥 [MESSAGES-UPSERT] REQUEST HEADERS:", JSON.stringify(req.headers, null, 2));
      console.log("🔥🔥🔥 [MESSAGES-UPSERT] ================================");
      console.log("🔍 [MESSAGES-UPSERT] Has data:", !!req.body.data);
      console.log("🔍 [MESSAGES-UPSERT] Has message:", !!req.body.data?.message);
      console.log("🔍 [MESSAGES-UPSERT] FromMe value:", req.body.data?.fromMe || req.body.data?.key?.fromMe);
      console.log("🔍 [MESSAGES-UPSERT] Message type:", req.body.data?.messageType);

      // DEBUG CRÍTICO: Ver estrutura do instanceId
      console.log("🔥 [INSTANCE DEBUG] Checking instance identification:");
      console.log("  - req.body.data?.instanceId:", req.body.data?.instanceId);
      console.log("  - req.body.instance:", req.body.instance);
      console.log("  - req.body.instanceName:", req.body.instanceName);
      console.log("  - req.body keys:", Object.keys(req.body));
      console.log("🔍 [MESSAGES-UPSERT] Available message fields:", Object.keys(req.body.data?.message || {}));
      console.log("🔍 [MESSAGES-UPSERT] Has imageMessage:", !!req.body.data?.message?.imageMessage);
      console.log("🔍 [MESSAGES-UPSERT] Has audioMessage:", !!req.body.data?.message?.audioMessage);
      console.log("🔍 [MESSAGES-UPSERT] Has conversation:", !!req.body.data?.message?.conversation);
      console.log("🔍 [MESSAGES-UPSERT] Has extendedTextMessage:", !!req.body.data?.message?.extendedTextMessage);
      
      // DEBUG ESPECIAL PARA ÁUDIO
      if (req.body.data?.message?.audioMessage) {
        console.log("🎤🎤🎤 [UPSERT] ÁUDIO DETECTADO NO ENDPOINT!");
        console.log("🎤 [UPSERT] AudioMessage:", JSON.stringify(req.body.data.message.audioMessage, null, 2));
      }
      console.log("🔥🔥🔥 [MESSAGES-UPSERT] Full request body:", JSON.stringify(req.body, null, 2));

      // VERIFICAR DUPLICAÇÃO: usar ID da mensagem para evitar processamento duplo
      const messageIdUpsert = req.body.data?.key?.id;
      if (messageIdUpsert) {
        if (processedMessagesCache.has(messageIdUpsert)) {
          console.log(`⏭️ [MESSAGES-UPSERT] Mensagem já processada (ID: ${messageIdUpsert}), ignorando duplicata`);
          return res.status(200).json({
            success: true,
            processed: false,
            ignored: true,
            reason: "Message already processed (duplicate)",
            type: "messages_upsert"
          });
        }
        // Marcar como processada
        processedMessagesCache.set(messageIdUpsert, Date.now());
        console.log(`🆔 [MESSAGES-UPSERT] Mensagem registrada no cache: ${messageIdUpsert}`);
      }

      // Redirecionar para o processamento principal
      await whatsappWebhookService.handleEvolutionMessage(req.body);
      
      res.status(200).json({ 
        success: true, 
        processed: true, 
        type: "messages_upsert", 
        timestamp: new Date().toISOString() 
      });
    } catch (error) {
      console.error("❌ Error in messages-upsert webhook:", error);
      res.status(200).json({ success: true, processed: false });
    }
  });

  app.post("/api/webhook/messages/chats-update", async (req, res) => {
    console.log("💬 [CHATS-UPDATE] Chat update received (ignoring)");
    res.status(200).json({ success: true, processed: false, type: "chats_update" });
  });

  app.post("/api/webhook/messages/messages-update", async (req, res) => {
    console.log("📝 [MESSAGES-UPDATE] Message update received (ignoring)");
    res.status(200).json({ success: true, processed: false, type: "messages_update" });
  });

  app.post("/api/webhook/messages/send-message", async (req, res) => {
    console.log("📤 [SEND-MESSAGE] Send message confirmation received (ignoring)");
    res.status(200).json({ success: true, processed: false, type: "send_message" });
  });

  app.post("/api/webhook/messages/chats-upsert", async (req, res) => {
    console.log("💬 [CHATS-UPSERT] Chat upsert received (ignoring)");
    res.status(200).json({ success: true, processed: false, type: "chats_upsert" });
  });

  // DUPLICATE ROUTE REMOVED - main webhook handler above handles all events



  // Endpoint para testar webhook localmente simulando Evolution API
  app.post("/api/test-webhook", async (req, res) => {
    try {
      const testPayload = {
        event: "messages.upsert",
        data: {
          instanceId: "deploy1",
          instanceName: "deploy1",
          messageType: "text",
          key: {
            remoteJid: "5511999999999@s.whatsapp.net",
            fromMe: false,
            id: "TEST" + Date.now()
          },
          pushName: "Teste Local",
          message: {
            conversation: "Olá, teste do webhook"
          }
        }
      };

      console.log("🧪 [TEST] Enviando payload de teste para webhook...");

      // Chamar o webhook internamente
      const webhookReq = { ...req, body: testPayload };
      const { whatsappWebhookService } = await import("./services/whatsappWebhook");
      await whatsappWebhookService.handleEvolutionMessage(testPayload);

      res.json({
        success: true,
        message: "Teste de webhook enviado",
        payload: testPayload
      });
    } catch (error: any) {
      console.error("❌ [TEST] Erro no teste:", error);
      res.status(500).json({
        error: "Erro no teste do webhook",
        details: error.message
      });
    }
  });

  // Endpoint de teste para simular mensagem
  app.post("/api/test-message", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { instanceId, phone, message } = req.body;
      
      if (!instanceId || !phone || !message) {
        return res.status(400).json({ error: "instanceId, phone e message são obrigatórios" });
      }

      const { messageProcessorService } = await import("./services/messageProcessor");
      const result = await messageProcessorService.testMessage(instanceId, phone, message);
      
      res.json(result);
    } catch (error) {
      console.error("Test message error:", error);
      res.status(500).json({ error: "Erro ao testar mensagem" });
    }
  });

  // Conversations
  app.get("/api/conversations", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { instanceId } = req.query;
      
      if (!instanceId) {
        return res.status(400).json({ error: "ID da instância é obrigatório" });
      }

      const conversations = await storage.getConversationsByInstance(instanceId as string);
      res.json(conversations);
    } catch (error) {
      console.error("Get conversations error:", error);
      res.status(500).json({ error: "Erro ao buscar conversas" });
    }
  });

  app.get("/api/conversations/:id/messages", authenticate, requireClient, async (req, res) => {
    try {
      const { id } = req.params;
      const messages = await storage.getMessagesByConversation(id);
      res.json(messages);
    } catch (error) {
      console.error("Get messages error:", error);
      res.status(500).json({ error: "Erro ao buscar mensagens" });
    }
  });

  app.post("/api/conversations/:id/messages", authenticate, requireClient, async (req, res) => {
    try {
      const { id } = req.params;
      const messageData = insertMessageSchema.parse({
        ...req.body,
        conversationId: id
      });

      const message = await storage.createMessage(messageData);
      res.status(201).json(message);
    } catch (error) {
      console.error("Create message error:", error);
      res.status(500).json({ error: "Erro ao criar mensagem" });
    }
  });

  // Fetch conversations directly from Evolution API
  app.get("/api/conversations/evolution/:instanceId", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { instanceId } = req.params;
      console.log(`🔍 [DEBUG] Fetching Evolution chats for instance: ${instanceId}`);
      
      // Get instance details to access Evolution API
      const instance = await storage.getWhatsappInstance(instanceId);
      if (!instance) {
        console.log(`❌ [ERROR] Instance not found: ${instanceId}`);
        return res.status(404).json({ error: "Instância não encontrada" });
      }

      console.log(`✅ [DEBUG] Instance found: ${instance.name}, companyId: ${instance.companyId}`);

      // Check if instance belongs to user's company
      if (instance.companyId !== req.user?.companyId) {
        console.log(`❌ [ERROR] Access denied for company ${req.user?.companyId}, instance belongs to ${instance.companyId}`);
        return res.status(403).json({ error: "Acesso negado" });
      }

      // Get Evolution API configuration
      const config = await storage.getEvolutionApiConfiguration();
      if (!config) {
        console.log(`❌ [ERROR] Evolution API config not found`);
        return res.status(400).json({ 
          error: "Configuração da Evolution API não encontrada", 
          details: "Acesse a área Admin para configurar a Evolution API primeiro" 
        });
      }

      console.log(`🔧 [DEBUG] Evolution API Config: ${config.evolutionURL}`);
      
      // Use instance token if available, otherwise fallback to global token
      const tokenToUse = instance.evolutionToken || config.evolutionToken;
      console.log(`🔐 [DEBUG] Using token: ${tokenToUse ? 'Instance-specific token' : 'Global token'}`);

      const evolutionApi = new EvolutionApiService({
        baseURL: config.evolutionURL,
        token: tokenToUse
      });

      console.log(`📞 [DEBUG] Trying multiple approaches to get conversations...`);

      let conversations = [];
      let evolutionChats = null;

      // Use evolutionInstanceId if available, otherwise fallback to instance name
      const instanceNameToUse = instance.evolutionInstanceId || instance.name.replace(/\s+/g, '_').toLowerCase();
      console.log(`🔧 [DEBUG] Using instance name: ${instanceNameToUse}`);

      try {
        // Approach 1: Try to get chats directly
        console.log(`📞 [DEBUG] Approach 1: Calling getChats`);
        evolutionChats = await evolutionApi.getChats(instanceNameToUse);
        console.log(`📊 [DEBUG] getChats response:`, {
          type: typeof evolutionChats,
          isArray: Array.isArray(evolutionChats),
          keys: evolutionChats ? Object.keys(evolutionChats) : 'no keys'
        });
      } catch (error) {
        console.log(`⚠️ [DEBUG] getChats failed:`, error.message);
      }

      if (!evolutionChats || (Array.isArray(evolutionChats) && evolutionChats.length === 0)) {
        try {
          // Approach 2: Try to get all messages (which might include chat info)
          console.log(`📞 [DEBUG] Approach 2: Calling getAllMessages`);
          const allMessages = await evolutionApi.getAllMessages(instanceNameToUse);
          console.log(`📊 [DEBUG] getAllMessages response:`, {
            type: typeof allMessages,
            isArray: Array.isArray(allMessages),
            keys: allMessages ? Object.keys(allMessages) : 'no keys'
          });
          
          // Extract unique chats from messages
          if (allMessages && Array.isArray(allMessages)) {
            const uniqueChats = new Map();
            allMessages.forEach((message: any) => {
              const chatId = message.key?.remoteJid || message.remoteJid || message.chatId || message.from;
              if (chatId) {
                const existingChat = uniqueChats.get(chatId);
                // Update with the most recent pushName or keep existing
                const pushName = message.pushName || existingChat?.pushName || existingChat?.name;
                
                uniqueChats.set(chatId, {
                  id: chatId,
                  remoteJid: chatId,
                  pushName: pushName,
                  name: pushName,
                  lastMessage: { text: message.message?.conversation || message.text || existingChat?.lastMessage?.text || 'Mensagem' },
                  unreadCount: existingChat?.unreadCount || 0
                });
              }
            });
            evolutionChats = Array.from(uniqueChats.values());
            console.log(`📊 [DEBUG] Extracted ${evolutionChats.length} unique chats from messages`);
          } else if (allMessages && allMessages.messages && allMessages.messages.records && Array.isArray(allMessages.messages.records)) {
            // Handle paginated response from Evolution API v2
            const uniqueChats = new Map();
            allMessages.messages.records.forEach((message: any) => {
              const chatId = message.key?.remoteJid || message.remoteJid || message.chatId || message.from;
              if (chatId) {
                const existingChat = uniqueChats.get(chatId);
                const pushName = message.pushName || existingChat?.pushName || existingChat?.name;
                
                uniqueChats.set(chatId, {
                  id: chatId,
                  remoteJid: chatId,
                  pushName: pushName,
                  name: pushName,
                  lastMessage: { text: message.message?.conversation || message.text || existingChat?.lastMessage?.text || 'Mensagem' },
                  unreadCount: existingChat?.unreadCount || 0
                });
              }
            });
            evolutionChats = Array.from(uniqueChats.values());
            console.log(`📊 [DEBUG] Extracted ${evolutionChats.length} unique chats from paginated messages`);
          } else if (allMessages && allMessages.data && Array.isArray(allMessages.data)) {
            const uniqueChats = new Map();
            allMessages.data.forEach((message: any) => {
              const chatId = message.key?.remoteJid || message.remoteJid || message.chatId || message.from;
              if (chatId) {
                const existingChat = uniqueChats.get(chatId);
                const pushName = message.pushName || existingChat?.pushName || existingChat?.name;
                
                uniqueChats.set(chatId, {
                  id: chatId,
                  remoteJid: chatId,
                  pushName: pushName,
                  name: pushName,
                  lastMessage: { text: message.message?.conversation || message.text || existingChat?.lastMessage?.text || 'Mensagem' },
                  unreadCount: existingChat?.unreadCount || 0
                });
              }
            });
            evolutionChats = Array.from(uniqueChats.values());
            console.log(`📊 [DEBUG] Extracted ${evolutionChats.length} unique chats from messages data`);
          }
        } catch (error) {
          console.log(`⚠️ [DEBUG] getAllMessages failed:`, error.message);
        }
      }

      // Transform Evolution API response to our conversation format
      if (Array.isArray(evolutionChats)) {
        conversations = evolutionChats;
      } else if (evolutionChats && evolutionChats.data && Array.isArray(evolutionChats.data)) {
        conversations = evolutionChats.data;
      } else if (evolutionChats && evolutionChats.chats && Array.isArray(evolutionChats.chats)) {
        conversations = evolutionChats.chats;
      } else if (evolutionChats && typeof evolutionChats === 'object') {
        // Check for different possible response structures
        const possibleKeys = ['result', 'results', 'items', 'messages', 'conversations'];
        for (const key of possibleKeys) {
          if (evolutionChats[key] && Array.isArray(evolutionChats[key])) {
            conversations = evolutionChats[key];
            console.log(`📊 [DEBUG] Found conversations in key: ${key}`);
            break;
          }
        }
        
        // If still no conversations found and evolutionChats has keys, log them
        if (conversations.length === 0 && Object.keys(evolutionChats).length > 0) {
          console.log(`⚠️ [DEBUG] Unknown response structure. Keys found:`, Object.keys(evolutionChats));
          // Try to return the raw object as an array
          conversations = [evolutionChats];
        }
      }

      console.log(`✅ [DEBUG] Final conversations array:`, {
        length: conversations.length,
        firstItem: conversations[0] ? Object.keys(conversations[0]) : 'no items',
        sample: conversations.slice(0, 2)
      });
      
      // Return empty array if no conversations found
      res.json(conversations || []);
    } catch (error) {
      console.error("❌ [ERROR] Get Evolution conversations error:", error);
      console.error("Error stack:", error.stack);
      res.status(500).json({ 
        error: "Erro ao buscar conversas da Evolution API",
        details: error.message 
      });
    }
  });

  // TEST DEBUG endpoint for Evolution API integration
  app.get("/api/conversations/evolution/:instanceId/test", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { instanceId } = req.params;
      console.log(`🧪 [TEST DEBUG] Starting Evolution API debug test for instance: ${instanceId}`);
      
      const debugResults: any = {
        step1_instanceLookup: null,
        step2_configLookup: null,
        step3_evolutionApiInit: null,
        step4_findChatsCall: null,
        step5_rawResponse: null,
        errors: []
      };

      // Step 1: Get instance details
      console.log(`🧪 [TEST DEBUG] Step 1: Looking up instance details...`);
      const instance = await storage.getWhatsappInstance(instanceId);
      if (!instance) {
        const error = `Instance not found: ${instanceId}`;
        console.log(`❌ [TEST DEBUG] ${error}`);
        debugResults.errors.push(error);
        return res.status(404).json({ 
          error: "Instância não encontrada",
          debugResults 
        });
      }

      debugResults.step1_instanceLookup = {
        found: true,
        instanceId: instance.id,
        instanceName: instance.name,
        evolutionInstanceId: instance.evolutionInstanceId,
        companyId: instance.companyId,
        status: instance.status
      };
      console.log(`✅ [TEST DEBUG] Step 1 SUCCESS: Instance found`, debugResults.step1_instanceLookup);

      // Check company access
      if (instance.companyId !== req.user?.companyId) {
        const error = `Access denied for company ${req.user?.companyId}, instance belongs to ${instance.companyId}`;
        console.log(`❌ [TEST DEBUG] ${error}`);
        debugResults.errors.push(error);
        return res.status(403).json({ 
          error: "Acesso negado",
          debugResults 
        });
      }

      // Step 2: Get Evolution API configuration
      console.log(`🧪 [TEST DEBUG] Step 2: Getting Evolution API configuration...`);
      const config = await storage.getEvolutionApiConfiguration();
      if (!config) {
        const error = "Evolution API configuration not found";
        console.log(`❌ [TEST DEBUG] ${error}`);
        debugResults.errors.push(error);
        return res.status(400).json({ 
          error: "Configuração da Evolution API não encontrada",
          debugResults
        });
      }

      debugResults.step2_configLookup = {
        found: true,
        evolutionURL: config.evolutionURL,
        hasToken: !!config.evolutionToken,
        tokenLength: config.evolutionToken?.length || 0
      };
      console.log(`✅ [TEST DEBUG] Step 2 SUCCESS: Evolution API config found`, debugResults.step2_configLookup);

      // Step 3: Initialize Evolution API service
      console.log(`🧪 [TEST DEBUG] Step 3: Initializing Evolution API service...`);
      const evolutionApi = new EvolutionApiService({
        baseURL: config.evolutionURL,
        token: config.evolutionToken
      });

      debugResults.step3_evolutionApiInit = {
        success: true,
        baseURL: config.evolutionURL,
        tokenProvided: !!config.evolutionToken
      };
      console.log(`✅ [TEST DEBUG] Step 3 SUCCESS: Evolution API service initialized`, debugResults.step3_evolutionApiInit);

      // Step 4: Determine instance name to use
      const instanceNameToUse = instance.evolutionInstanceId || instance.name.replace(/\s+/g, '_').toLowerCase();
      console.log(`🧪 [TEST DEBUG] Step 4: Using instance name for Evolution API call: ${instanceNameToUse}`);
      
      debugResults.step4_findChatsCall = {
        originalInstanceName: instance.name,
        evolutionInstanceId: instance.evolutionInstanceId,
        finalInstanceName: instanceNameToUse
      };

      // Step 5: Make direct call to Evolution API findChats
      console.log(`🧪 [TEST DEBUG] Step 5: Making direct call to Evolution API findChats...`);
      try {
        const rawResponse = await evolutionApi.getChats(instanceNameToUse);
        
        debugResults.step5_rawResponse = {
          success: true,
          responseType: typeof rawResponse,
          isArray: Array.isArray(rawResponse),
          hasData: !!rawResponse,
          keys: rawResponse ? Object.keys(rawResponse) : [],
          length: Array.isArray(rawResponse) ? rawResponse.length : (rawResponse?.length || 'N/A'),
          sample: Array.isArray(rawResponse) ? rawResponse.slice(0, 2) : rawResponse
        };
        
        console.log(`✅ [TEST DEBUG] Step 5 SUCCESS: Raw Evolution API response:`, debugResults.step5_rawResponse);
        console.log(`📊 [TEST DEBUG] Full raw response structure:`, JSON.stringify(rawResponse, null, 2));
        
        // Return complete debug information
        res.json({
          success: true,
          message: "Evolution API debug test completed successfully",
          debugResults,
          fullRawResponse: rawResponse
        });
        
      } catch (evolutionError: any) {
        const error = `Evolution API findChats failed: ${evolutionError.message}`;
        console.log(`❌ [TEST DEBUG] Step 5 FAILED: ${error}`);
        console.error(`❌ [TEST DEBUG] Evolution API error details:`, evolutionError);
        
        debugResults.step5_rawResponse = {
          success: false,
          error: evolutionError.message,
          stack: evolutionError.stack
        };
        debugResults.errors.push(error);
        
        res.status(500).json({
          success: false,
          error: "Evolution API call failed",
          debugResults
        });
      }
      
    } catch (error: any) {
      console.error("❌ [TEST DEBUG] General error during debug test:", error);
      console.error("❌ [TEST DEBUG] Error stack:", error.stack);
      res.status(500).json({ 
        success: false,
        error: "Erro durante teste de debug da Evolution API",
        details: error.message,
        debugResults: debugResults || {}
      });
    }
  });

  // Test endpoint to debug Evolution API messages
  app.get("/api/conversations/evolution/:instanceId/:chatId/test-messages", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { instanceId, chatId } = req.params;
      
      // Get instance details
      const instance = await storage.getWhatsappInstance(instanceId);
      if (!instance) {
        return res.status(404).json({ error: "Instância não encontrada" });
      }

      // Get Evolution API configuration
      const config = await storage.getEvolutionApiConfiguration();
      if (!config) {
        return res.status(400).json({ error: "Configuração da Evolution API não encontrada" });
      }

      const tokenToUse = instance.evolutionToken || config.evolutionToken;
      const instanceNameToUse = instance.evolutionInstanceId || instance.name.replace(/\s+/g, '_').toLowerCase();
      
      console.log(`🧪 [TEST] Testing messages for instance: ${instanceNameToUse}, chatId: ${chatId}`);
      
      const testResults = {
        instanceName: instanceNameToUse,
        chatId: chatId,
        tests: []
      };

      // Test 1: Try with original chatId
      try {
        const test1 = await fetch(`${config.evolutionURL}/chat/findMessages/${instanceNameToUse}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': tokenToUse
          },
          body: JSON.stringify({
            where: {
              key: {
                remoteJid: chatId
              }
            },
            limit: 10
          })
        });
        const result1 = await test1.json();
        testResults.tests.push({
          name: "Test 1: Original chatId with key.remoteJid",
          status: test1.status,
          response: result1
        });
      } catch (e) {
        testResults.tests.push({
          name: "Test 1: Original chatId with key.remoteJid",
          error: e.message
        });
      }

      // Test 2: Try with direct remoteJid
      try {
        const test2 = await fetch(`${config.evolutionURL}/chat/findMessages/${instanceNameToUse}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': tokenToUse
          },
          body: JSON.stringify({
            where: {
              remoteJid: chatId
            },
            limit: 10
          })
        });
        const result2 = await test2.json();
        testResults.tests.push({
          name: "Test 2: Original chatId with direct remoteJid",
          status: test2.status,
          response: result2
        });
      } catch (e) {
        testResults.tests.push({
          name: "Test 2: Original chatId with direct remoteJid",
          error: e.message
        });
      }

      // Test 3: Try without where clause (get all messages)
      try {
        const test3 = await fetch(`${config.evolutionURL}/chat/findMessages/${instanceNameToUse}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': tokenToUse
          },
          body: JSON.stringify({
            where: {},
            limit: 10
          })
        });
        const result3 = await test3.json();
        testResults.tests.push({
          name: "Test 3: Get all messages (empty where)",
          status: test3.status,
          response: result3,
          sampleMessage: Array.isArray(result3) && result3.length > 0 ? result3[0] : null
        });
      } catch (e) {
        testResults.tests.push({
          name: "Test 3: Get all messages (empty where)",
          error: e.message
        });
      }

      res.json(testResults);
    } catch (error) {
      console.error("Test messages error:", error);
      res.status(500).json({ error: "Erro no teste", details: error.message });
    }
  });

  // Fetch specific chat messages from Evolution API
  app.get("/api/conversations/evolution/:instanceId/:chatId/messages", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { instanceId, chatId } = req.params;
      
      // Get instance details to access Evolution API
      const instance = await storage.getWhatsappInstance(instanceId);
      if (!instance) {
        return res.status(404).json({ error: "Instância não encontrada" });
      }

      // Check if instance belongs to user's company
      if (instance.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      // Get Evolution API configuration
      const config = await storage.getEvolutionApiConfiguration();
      if (!config) {
        console.log(`❌ [ERROR] Evolution API configuration not found`);
        return res.status(400).json({ 
          error: "Configuração da Evolution API não encontrada", 
          details: "Acesse a área Admin para configurar a Evolution API primeiro" 
        });
      }

      // Use instance token if available, otherwise fallback to global token
      const tokenToUse = instance.evolutionToken || config.evolutionToken;
      console.log(`🔐 [DEBUG] Using token: ${tokenToUse ? 'Instance-specific token' : 'Global token'} for messages`);

      const evolutionApi = new EvolutionApiService({
        baseURL: config.evolutionURL,
        token: tokenToUse
      });

      // Use evolutionInstanceId if available, otherwise fallback to instance name
      const instanceNameToUse = instance.evolutionInstanceId || instance.name.replace(/\s+/g, '_').toLowerCase();
      console.log(`🔧 [DEBUG] Using instance name: ${instanceNameToUse} for chat: ${chatId}`);
      console.log(`📱 [DEBUG] Full chatId/remoteJid: "${chatId}"`);

      // Fetch messages from specific chat
      const chatMessagesResponse = await evolutionApi.getChatMessages(instanceNameToUse, chatId);
      console.log(`📨 [DEBUG] Raw response from Evolution API:`, JSON.stringify(chatMessagesResponse, null, 2).substring(0, 500));
      
      // Ensure response is always an array
      let chatMessages = [];
      if (Array.isArray(chatMessagesResponse)) {
        chatMessages = chatMessagesResponse;
      } else if (chatMessagesResponse && chatMessagesResponse.messages && chatMessagesResponse.messages.records && Array.isArray(chatMessagesResponse.messages.records)) {
        // Evolution API v2 paginated response format
        chatMessages = chatMessagesResponse.messages.records;
        console.log(`📊 [DEBUG] Found ${chatMessages.length} messages in messages.records (page ${chatMessagesResponse.messages.currentPage}/${chatMessagesResponse.messages.pages})`);
      } else if (chatMessagesResponse && chatMessagesResponse.data && Array.isArray(chatMessagesResponse.data)) {
        chatMessages = chatMessagesResponse.data;
      } else if (chatMessagesResponse && chatMessagesResponse.messages && Array.isArray(chatMessagesResponse.messages)) {
        chatMessages = chatMessagesResponse.messages;
      } else if (chatMessagesResponse && chatMessagesResponse.result && Array.isArray(chatMessagesResponse.result)) {
        chatMessages = chatMessagesResponse.result;
      } else if (chatMessagesResponse && chatMessagesResponse.records && Array.isArray(chatMessagesResponse.records)) {
        chatMessages = chatMessagesResponse.records;
      } else if (chatMessagesResponse && typeof chatMessagesResponse === 'object') {
        // Log the structure to understand what we're getting
        console.log(`⚠️ [DEBUG] Unknown message response structure. Keys:`, Object.keys(chatMessagesResponse));
        // Try to find array in the response
        const possibleKeys = ['items', 'rows', 'content'];
        for (const key of possibleKeys) {
          if (chatMessagesResponse[key] && Array.isArray(chatMessagesResponse[key])) {
            chatMessages = chatMessagesResponse[key];
            console.log(`📊 [DEBUG] Found messages in key: ${key}`);
            break;
          }
        }
      }
      
      console.log(`✅ [DEBUG] Returning ${chatMessages.length} messages for chat ${chatId}`);
      res.json(chatMessages);
    } catch (error) {
      console.error("Get Evolution chat messages error:", error);
      res.status(500).json({ error: "Erro ao buscar mensagens do chat da Evolution API" });
    }
  });

  // Object storage endpoints for file uploads
  const objectStorageService = new ObjectStorageService();

  app.post("/api/objects/upload", authenticate, requireClient, async (req, res) => {
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Get upload URL error:", error);
      res.status(500).json({ error: "Erro ao obter URL de upload" });
    }
  });

  app.put("/api/avatar", authenticate, async (req: AuthRequest, res) => {
    try {
      const { avatarURL } = req.body;
      
      if (!avatarURL) {
        return res.status(400).json({ error: "URL do avatar é obrigatória" });
      }

      const objectPath = objectStorageService.normalizeObjectEntityPath(avatarURL);
      
      if (req.user?.companyId) {
        await storage.updateCompany(req.user.companyId, { avatar: objectPath });
      }

      res.json({ objectPath });
    } catch (error) {
      console.error("Update avatar error:", error);
      res.status(500).json({ error: "Erro ao atualizar avatar" });
    }
  });

  // Admin statistics endpoints
  app.get("/api/admin/stats", authenticate, requireAdmin, async (req, res) => {
    try {
      const companies = await storage.getAllCompanies();
      
      // Count instances and agents for all companies
      let totalInstances = 0;
      let totalAgents = 0;
      
      for (const company of companies) {
        const instances = await storage.getWhatsappInstancesByCompany(company.id);
        const agents = await storage.getAiAgentsByCompany(company.id);
        totalInstances += instances.length;
        totalAgents += agents.length;
      }

      res.json({
        activeCompanies: companies.filter(c => c.status === 'active').length,
        whatsappInstances: totalInstances,
        aiAgents: totalAgents,
        todayConversations: 0 // This would need more complex querying
      });
    } catch (error) {
      console.error("Get admin stats error:", error);
      res.status(500).json({ error: "Erro ao buscar estatísticas" });
    }
  });

  app.get("/api/client/stats", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const companyId = req.user.companyId;
      const instances = await storage.getWhatsappInstancesByCompany(companyId);
      const agents = await storage.getAiAgentsByCompany(companyId);
      const leads = await storage.getLeadsByCompany(companyId);
      const appointments = await storage.getAppointmentsByCompany(companyId);

      // DEBUG: Log appointments
      console.log(`📅 [STATS DEBUG] Total appointments no banco: ${appointments.length}`);
      if (appointments.length > 0) {
        appointments.forEach((apt, idx) => {
          console.log(`📅 [STATS DEBUG] Appointment ${idx}: createdAt=${apt.createdAt}`);
        });
      }

      // Parse date range from query parameters
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

      // Define period dates
      const now = new Date();
      let periodStart: Date;
      let periodEnd: Date;

      if (startDate && endDate) {
        // Criar datas no timezone local (não UTC) para evitar problemas de timezone
        const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
        const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
        periodStart = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
        periodEnd = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
      } else {
        // Default to today
        periodStart = new Date(now);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd = new Date(now);
        periodEnd.setHours(23, 59, 59, 999);
      }

      // Calculate previous period (same duration before the selected period)
      const periodDuration = periodEnd.getTime() - periodStart.getTime();
      const prevPeriodEnd = new Date(periodStart.getTime() - 1);
      const prevPeriodStart = new Date(prevPeriodEnd.getTime() - periodDuration);
      prevPeriodStart.setHours(0, 0, 0, 0);

      // Debug: Ver todos os leads
      console.log(`📊 [STATS DEBUG] Total leads da empresa: ${leads.length}`);
      console.log(`📊 [STATS DEBUG] Período: ${periodStart.toISOString()} até ${periodEnd.toISOString()}`);

      // Leads do WhatsApp (sem filtro de data primeiro para debug)
      const leadsWhatsApp = leads.filter(l => l.source === 'WhatsApp');
      console.log(`📊 [STATS DEBUG] Leads com source='WhatsApp': ${leadsWhatsApp.length}`);

      if (leadsWhatsApp.length > 0) {
        console.log(`📊 [STATS DEBUG] Exemplo de lead:`, {
          id: leadsWhatsApp[0].id,
          source: leadsWhatsApp[0].source,
          createdAt: leadsWhatsApp[0].createdAt,
          createdAtType: typeof leadsWhatsApp[0].createdAt
        });
      }

      // Leads do WhatsApp do período selecionado e período anterior
      const leadsPeriod = leads.filter(l => {
        if (!l.createdAt) return false;
        if (l.source !== 'WhatsApp') return false; // Apenas leads do WhatsApp
        const createdAt = new Date(l.createdAt);
        return createdAt >= periodStart && createdAt <= periodEnd;
      }).length;

      console.log(`📊 [STATS DEBUG] Leads WhatsApp no período: ${leadsPeriod}`);

      const leadsPrevPeriod = leads.filter(l => {
        if (!l.createdAt) return false;
        if (l.source !== 'WhatsApp') return false; // Apenas leads do WhatsApp
        const createdAt = new Date(l.createdAt);
        return createdAt >= prevPeriodStart && createdAt <= prevPeriodEnd;
      }).length;

      // Buscar conversas de todas as instâncias
      let allConversations: any[] = [];
      for (const instance of instances) {
        const convs = await storage.getConversationsByInstance(instance.id);
        allConversations = [...allConversations, ...convs];
      }

      console.log(`📊 [STATS DEBUG] Total conversas: ${allConversations.length}`);

      if (allConversations.length > 0) {
        console.log(`📊 [STATS DEBUG] Exemplo de conversa:`, {
          id: allConversations[0].id,
          createdAt: allConversations[0].createdAt,
          createdAtType: typeof allConversations[0].createdAt
        });
      }

      // Conversas do período selecionado e período anterior
      const conversationsPeriod = allConversations.filter(c => {
        if (!c.createdAt) return false;
        const createdAt = new Date(c.createdAt);
        return createdAt >= periodStart && createdAt <= periodEnd;
      }).length;

      console.log(`📊 [STATS DEBUG] Conversas no período: ${conversationsPeriod}`);

      const conversationsPrevPeriod = allConversations.filter(c => {
        if (!c.createdAt) return false;
        const createdAt = new Date(c.createdAt);
        return createdAt >= prevPeriodStart && createdAt <= prevPeriodEnd;
      }).length;

      // Agendamentos do período selecionado e período anterior
      // Usar createdAt (quando o agendamento foi CRIADO)
      const appointmentsPeriod = appointments.filter(a => {
        if (!a.createdAt) return false;
        const createdAt = new Date(a.createdAt);
        return createdAt >= periodStart && createdAt <= periodEnd;
      }).length;

      const appointmentsPrevPeriod = appointments.filter(a => {
        if (!a.createdAt) return false;
        const createdAt = new Date(a.createdAt);
        return createdAt >= prevPeriodStart && createdAt <= prevPeriodEnd;
      }).length;

      console.log(`📅 [STATS DEBUG] periodStart: ${periodStart.toISOString()}, periodEnd: ${periodEnd.toISOString()}`);
      console.log(`📅 [STATS DEBUG] Agendamentos no período: ${appointmentsPeriod}, período anterior: ${appointmentsPrevPeriod}`);

      // Calcular variação percentual
      const calcChange = (current: number, previous: number): number => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Number((((current - previous) / previous) * 100).toFixed(1));
      };

      res.json({
        activeInstances: instances.filter(i => i.status === 'connected').length,
        aiAgents: agents.length,
        leadsToday: { value: leadsPeriod, change: calcChange(leadsPeriod, leadsPrevPeriod) },
        scheduledMeetings: { value: appointmentsPeriod, change: calcChange(appointmentsPeriod, appointmentsPrevPeriod) },
        conversationsToday: { value: conversationsPeriod, change: calcChange(conversationsPeriod, conversationsPrevPeriod) }
      });
    } catch (error) {
      console.error("Get client stats error:", error);
      res.status(500).json({ error: "Erro ao buscar estatísticas" });
    }
  });

  // Dashboard charts data - Property types and transaction demand from leads
  app.get("/api/client/dashboard-charts", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const allLeads = await storage.getLeadsByCompany(req.user.companyId);
      const allCustomers = await storage.getCustomersByCompany(req.user.companyId);
      const allAppointments = await storage.getAppointmentsByCompany(req.user.companyId);

      // Parse date range from query parameters
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

      // Define period dates
      const now = new Date();
      let periodStart: Date;
      let periodEnd: Date;

      if (startDate && endDate) {
        // Criar datas no timezone local (não UTC) para evitar problemas de timezone
        const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
        const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
        periodStart = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
        periodEnd = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
      } else {
        // Default to today
        periodStart = new Date(now);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd = new Date(now);
        periodEnd.setHours(23, 59, 59, 999);
      }

      // Filter leads by date range
      const leads = allLeads.filter(lead => {
        if (!lead.createdAt) return false;
        const createdAt = new Date(lead.createdAt);
        return createdAt >= periodStart && createdAt <= periodEnd;
      });

      // Filter customers by date range
      const customers = allCustomers.filter(customer => {
        if (!customer.createdAt) return false;
        const createdAt = new Date(customer.createdAt);
        return createdAt >= periodStart && createdAt <= periodEnd;
      });

      // Agregar por tipo de imóvel (combinando leads e customers)
      const propertyTypeCounts: Record<string, number> = {};

      // Contar dos leads
      leads.forEach(lead => {
        if (lead.interestedPropertyType) {
          const type = lead.interestedPropertyType;
          propertyTypeCounts[type] = (propertyTypeCounts[type] || 0) + 1;
        }
      });

      // Contar dos customers (se não tiver no lead correspondente)
      customers.forEach(customer => {
        if (customer.interestedPropertyType) {
          // Verificar se já não foi contado pelo lead
          const correspondingLead = leads.find(l => l.phone === customer.phone);
          if (!correspondingLead?.interestedPropertyType) {
            const type = customer.interestedPropertyType;
            propertyTypeCounts[type] = (propertyTypeCounts[type] || 0) + 1;
          }
        }
      });

      // Converter para array ordenado
      const propertyTypes = Object.entries(propertyTypeCounts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 4)
        .map((item, index) => ({ rank: index + 1, name: item.name, value: item.value }));

      // Agregar por tipo de transação (combinando leads e customers)
      const transactionTypeCounts: Record<string, number> = {};

      // Contar dos leads
      leads.forEach(lead => {
        if ((lead as any).interestedTransactionType) {
          const type = (lead as any).interestedTransactionType;
          transactionTypeCounts[type] = (transactionTypeCounts[type] || 0) + 1;
        }
      });

      // Contar dos customers (se não tiver no lead correspondente)
      customers.forEach(customer => {
        if ((customer as any).interestedTransactionType) {
          const correspondingLead = leads.find(l => l.phone === customer.phone);
          if (!(correspondingLead as any)?.interestedTransactionType) {
            const type = (customer as any).interestedTransactionType;
            transactionTypeCounts[type] = (transactionTypeCounts[type] || 0) + 1;
          }
        }
      });

      // Converter para array ordenado
      const transactionTypes = Object.entries(transactionTypeCounts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .map((item, index) => ({ rank: index + 1, name: item.name, value: item.value }));

      // Agregar agendamentos por dia no período
      // Usar createdAt (quando o agendamento foi CRIADO)
      const appointmentsInPeriod = allAppointments.filter(apt => {
        if (!apt.createdAt) return false;
        const createdAt = new Date(apt.createdAt);
        return createdAt >= periodStart && createdAt <= periodEnd;
      });

      // Criar mapa de agendamentos por dia
      const appointmentsByDay: Record<string, number> = {};

      // Gerar todos os dias do período
      const currentDate = new Date(periodStart);
      while (currentDate <= periodEnd) {
        const dayKey = currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        appointmentsByDay[dayKey] = 0;
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Contar agendamentos por dia (usando createdAt)
      appointmentsInPeriod.forEach(apt => {
        if (apt.createdAt) {
          const dayKey = new Date(apt.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
          if (appointmentsByDay[dayKey] !== undefined) {
            appointmentsByDay[dayKey]++;
          }
        }
      });

      // Converter para array ordenado por data
      const appointmentsChart = Object.entries(appointmentsByDay)
        .map(([day, agendadas]) => ({ day, agendadas }));

      res.json({
        propertyTypes,
        transactionTypes,
        appointmentsChart
      });
    } catch (error) {
      console.error("Get dashboard charts error:", error);
      res.status(500).json({ error: "Erro ao buscar dados dos gráficos" });
    }
  });

  // Contact Lists endpoints
  app.get("/api/contact-lists", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const contactLists = await storage.getContactListsByCompany(req.user.companyId);
      
      // For each list, get the contact items to provide complete data
      const listsWithContacts = await Promise.all(
        contactLists.map(async (list) => {
          const contacts = await storage.getContactListItems(list.id);
          return {
            ...list,
            contacts: contacts.map(contact => ({
              name: contact.name,
              phone: contact.phone,
              valid: contact.valid,
              error: contact.error
            }))
          };
        })
      );

      res.json(listsWithContacts);
    } catch (error) {
      console.error("Get contact lists error:", error);
      res.status(500).json({ error: "Erro ao buscar listas de contatos" });
    }
  });

  app.post("/api/contact-lists", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const { name, contacts } = req.body;
      
      if (!name || !contacts || !Array.isArray(contacts)) {
        return res.status(400).json({ error: "Nome e lista de contatos são obrigatórios" });
      }

      // Calculate statistics
      const totalContacts = contacts.length;
      const validContacts = contacts.filter((c: any) => c.valid).length;

      // Create the contact list
      const listData = {
        companyId: req.user.companyId,
        name,
        totalContacts,
        validContacts
      };

      const contactList = await storage.createContactList(listData);

      // Create contact list items
      for (const contact of contacts) {
        await storage.createContactListItem({
          contactListId: contactList.id,
          name: contact.name,
          phone: contact.phone,
          valid: contact.valid || false,
          error: contact.error || null
        });
      }

      // Get the complete list with contacts for response
      const contactItems = await storage.getContactListItems(contactList.id);
      const completeList = {
        ...contactList,
        contacts: contactItems.map(contact => ({
          name: contact.name,
          phone: contact.phone,
          valid: contact.valid,
          error: contact.error
        }))
      };

      res.status(201).json(completeList);
    } catch (error) {
      console.error("Create contact list error:", error);
      res.status(500).json({ error: "Erro ao criar lista de contatos" });
    }
  });

  app.get("/api/contact-lists/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const contactList = await storage.getContactList(id);

      if (!contactList) {
        return res.status(404).json({ error: "Lista de contatos não encontrada" });
      }

      // Check company access
      if (req.user?.role !== 'admin' && contactList.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado: lista não pertence à sua empresa" });
      }

      // Get contact items
      const contacts = await storage.getContactListItems(contactList.id);
      const completeList = {
        ...contactList,
        contacts: contacts.map(contact => ({
          name: contact.name,
          phone: contact.phone,
          valid: contact.valid,
          error: contact.error
        }))
      };

      res.json(completeList);
    } catch (error) {
      console.error("Get contact list error:", error);
      res.status(500).json({ error: "Erro ao buscar lista de contatos" });
    }
  });

  app.delete("/api/contact-lists/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const contactList = await storage.getContactList(id);

      if (!contactList) {
        return res.status(404).json({ error: "Lista de contatos não encontrada" });
      }

      // Check company access
      if (req.user?.role !== 'admin' && contactList.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado: lista não pertence à sua empresa" });
      }

      await storage.deleteContactList(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete contact list error:", error);
      res.status(500).json({ error: "Erro ao excluir lista de contatos" });
    }
  });

  // Scheduled Messages endpoints
  app.post("/api/scheduled-messages", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      // Parse the scheduledDateTime - it may come as "YYYY-MM-DD HH:MM:SS" or ISO string
      let scheduledDateTime: Date;
      if (req.body.scheduledDateTime.includes('T')) {
        // ISO format
        scheduledDateTime = new Date(req.body.scheduledDateTime);
      } else {
        // MySQL format "YYYY-MM-DD HH:MM:SS" - treat as local time
        // Don't use new Date() with replace as it adds timezone offset
        // Instead, parse the components and create a local date
        const [datePart, timePart] = req.body.scheduledDateTime.split(' ');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hour, minute, second] = timePart.split(':').map(Number);
        
        // Create date in local timezone (server timezone)
        scheduledDateTime = new Date(year, month - 1, day, hour, minute, second || 0);
        
        console.log(`📅 Parsed scheduled date: ${req.body.scheduledDateTime} -> ${scheduledDateTime.toISOString()}`);
      }
      
      const messageData = insertScheduledMessageSchema.parse({
        ...req.body,
        scheduledDateTime,
        companyId: req.user.companyId
      });

      const scheduledMessage = await storage.createScheduledMessage(messageData);
      
      // If scheduled for immediate sending (within 1 minute), mark for processing
      const now = new Date();
      const scheduledTime = new Date(messageData.scheduledDateTime);
      
      if (scheduledTime <= new Date(now.getTime() + 60000)) { // 1 minute from now
        await storage.updateScheduledMessage(scheduledMessage.id, { 
          status: 'processing',
          startedAt: new Date()
        });
      }

      res.json(scheduledMessage);
    } catch (error) {
      console.error("Create scheduled message error:", error);
      res.status(500).json({ error: "Erro ao criar agendamento" });
    }
  });

  app.get("/api/scheduled-messages", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const scheduledMessages = await storage.getScheduledMessagesByCompany(req.user.companyId);
      res.json(scheduledMessages);
    } catch (error) {
      console.error("Get scheduled messages error:", error);
      res.status(500).json({ error: "Erro ao buscar agendamentos" });
    }
  });

  app.get("/api/scheduled-messages/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const scheduledMessage = await storage.getScheduledMessage(id);
      
      if (!scheduledMessage) {
        return res.status(404).json({ error: "Agendamento não encontrado" });
      }

      // Check company access
      if (req.user?.role !== 'admin' && scheduledMessage.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      res.json(scheduledMessage);
    } catch (error) {
      console.error("Get scheduled message error:", error);
      res.status(500).json({ error: "Erro ao buscar agendamento" });
    }
  });

  app.put("/api/scheduled-messages/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const scheduledMessage = await storage.getScheduledMessage(id);
      
      if (!scheduledMessage) {
        return res.status(404).json({ error: "Agendamento não encontrado" });
      }

      // Check company access
      if (req.user?.role !== 'admin' && scheduledMessage.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const updatedMessage = await storage.updateScheduledMessage(id, req.body);
      res.json(updatedMessage);
    } catch (error) {
      console.error("Update scheduled message error:", error);
      res.status(500).json({ error: "Erro ao atualizar agendamento" });
    }
  });

  app.put("/api/scheduled-messages/:id/force-process", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const storage = await getStorage();
      const scheduledMessage = await storage.getScheduledMessage(id);
      
      if (!scheduledMessage) {
        return res.status(404).json({ error: "Agendamento não encontrado" });
      }

      // Check company access
      if (req.user?.role !== 'admin' && scheduledMessage.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      // Force process this message immediately
      console.log(`🚀 [DEBUG] Force processing message ${id}`);
      
      // Import and use the processor
      const { scheduledMessageProcessor } = await import('./services/scheduledMessageProcessor');
      await (scheduledMessageProcessor as any).processSingleMessage(scheduledMessage);
      
      res.json({ success: true, message: 'Processamento forçado iniciado' });
    } catch (error: any) {
      console.error("Force process error:", error);
      res.status(500).json({ error: error.message || "Erro ao forçar processamento" });
    }
  });

  app.put("/api/scheduled-messages/:id/test-process", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const scheduledMessage = await storage.getScheduledMessage(id);
      
      if (!scheduledMessage) {
        return res.status(404).json({ error: "Agendamento não encontrado" });
      }

      // Check company access
      if (req.user?.role !== 'admin' && scheduledMessage.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      // Test getting the contact list
      const contactList = await storage.getContactList(scheduledMessage.contactListId);
      const contacts = await storage.getContactListItems(scheduledMessage.contactListId);
      const validContacts = contacts.filter(c => c.valid);
      
      // Test getting instances
      const instances = await storage.getWhatsappInstancesByIds(scheduledMessage.instanceIds);
      const connectedInstances = instances.filter(i => i.status === 'connected');
      
      res.json({ 
        success: true,
        debug: {
          scheduledMessage: {
            id: scheduledMessage.id,
            status: scheduledMessage.status,
            scheduledDateTime: scheduledMessage.scheduledDateTime,
            totalMessages: scheduledMessage.totalMessages
          },
          contactList: {
            found: !!contactList,
            name: contactList?.name,
            totalContacts: contacts.length,
            validContacts: validContacts.length
          },
          instances: {
            requested: scheduledMessage.instanceIds,
            found: instances.length,
            connected: connectedInstances.length,
            details: instances.map(i => ({ id: i.id, name: i.name, status: i.status }))
          }
        }
      });
    } catch (error: any) {
      console.error("Test process error:", error);
      res.status(500).json({ error: error.message || "Erro ao testar processamento" });
    }
  });

  app.put("/api/scheduled-messages/:id/force-complete", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const scheduledMessage = await storage.getScheduledMessage(id);
      
      if (!scheduledMessage) {
        return res.status(404).json({ error: "Agendamento não encontrado" });
      }

      // Check company access
      if (req.user?.role !== 'admin' && scheduledMessage.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      // Force complete any stuck message
      if (scheduledMessage.status === 'processing') {
        await storage.updateScheduledMessage(id, {
          status: 'completed',
          completedAt: new Date(),
          sentMessages: scheduledMessage.totalMessages,
          failedMessages: 0
        });
        
        res.json({ success: true, message: 'Disparo marcado como concluído' });
      } else {
        res.status(400).json({ error: 'Este disparo não está em processamento' });
      }
    } catch (error) {
      console.error("Force complete scheduled message error:", error);
      res.status(500).json({ error: "Erro ao concluir agendamento" });
    }
  });

  app.put("/api/scheduled-messages/:id/cancel", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const scheduledMessage = await storage.getScheduledMessage(id);
      
      if (!scheduledMessage) {
        return res.status(404).json({ error: "Agendamento não encontrado" });
      }

      // Check company access
      if (req.user?.role !== 'admin' && scheduledMessage.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      // Force cancel/fail any stuck message
      if (scheduledMessage.status === 'processing' || scheduledMessage.status === 'scheduled') {
        await storage.updateScheduledMessage(id, {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: 'Cancelado manualmente pelo usuário'
        });
        
        res.json({ success: true, message: 'Disparo cancelado com sucesso' });
      } else {
        res.status(400).json({ error: 'Este disparo não pode ser cancelado' });
      }
    } catch (error) {
      console.error("Cancel scheduled message error:", error);
      res.status(500).json({ error: "Erro ao cancelar agendamento" });
    }
  });

  app.delete("/api/scheduled-messages/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const scheduledMessage = await storage.getScheduledMessage(id);
      
      if (!scheduledMessage) {
        return res.status(404).json({ error: "Agendamento não encontrado" });
      }

      // Check company access
      if (req.user?.role !== 'admin' && scheduledMessage.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      // Allow deletion for failed, cancelled, or scheduled messages
      if (scheduledMessage.status === 'processing') {
        return res.status(400).json({ error: "Use o botão cancelar para disparos em processamento" });
      }
      
      if (scheduledMessage.status === 'completed') {
        return res.status(400).json({ error: "Não é possível excluir agendamento concluído" });
      }

      await storage.deleteScheduledMessage(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete scheduled message error:", error);
      res.status(500).json({ error: "Erro ao excluir agendamento" });
    }
  });

  // Funnel Stages endpoints (Global - fixed for all companies)
  app.get("/api/funnel-stages", authenticate, async (req: AuthRequest, res) => {
    try {
      const funnelStages = await storage.getGlobalFunnelStages();
      res.json(funnelStages);
    } catch (error) {
      console.error("Get funnel stages error:", error);
      res.status(500).json({ error: "Erro ao buscar etapas do funil" });
    }
  });

  // Customer endpoints
  app.get("/api/customers", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const customers = await storage.getCustomersByCompany(req.user.companyId);
      res.json(customers);
    } catch (error) {
      console.error("Get customers error:", error);
      res.status(500).json({ error: "Erro ao buscar clientes" });
    }
  });

  app.post("/api/customers", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const customerData = insertCustomerSchema.parse({
        ...req.body,
        companyId: req.user.companyId,
      });

      const customer = await storage.createCustomer(customerData);
      res.status(201).json(customer);
    } catch (error) {
      console.error("Create customer error:", error);
      res.status(500).json({ error: "Erro ao criar cliente" });
    }
  });

  app.put("/api/customers/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const customer = await storage.getCustomer(id);
      
      if (!customer) {
        return res.status(404).json({ error: "Cliente não encontrado" });
      }

      // Check company access
      if (req.user?.role !== 'admin' && customer.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const updatedCustomer = await storage.updateCustomer(id, req.body);
      res.json(updatedCustomer);
    } catch (error) {
      console.error("Update customer error:", error);
      res.status(500).json({ error: "Erro ao atualizar cliente" });
    }
  });

  app.delete("/api/customers/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const customer = await storage.getCustomer(id);
      
      if (!customer) {
        return res.status(404).json({ error: "Cliente não encontrado" });
      }

      // Check company access
      if (req.user?.role !== 'admin' && customer.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      await storage.deleteCustomer(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete customer error:", error);
      res.status(500).json({ error: "Erro ao excluir cliente" });
    }
  });

  // Leads endpoints
  app.get("/api/leads", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const leads = await storage.getLeadsByCompany(req.user.companyId);
      res.json(leads);
    } catch (error) {
      console.error("Get leads error:", error);
      res.status(500).json({ error: "Erro ao buscar leads" });
    }
  });

  app.post("/api/leads", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const leadData = insertLeadSchema.parse({
        ...req.body,
        companyId: req.user.companyId,
      });

      const lead = await storage.createLead(leadData);
      res.status(201).json(lead);
    } catch (error) {
      console.error("Create lead error:", error);
      res.status(500).json({ error: "Erro ao criar lead" });
    }
  });

  app.put("/api/leads/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const lead = await storage.getLead(id);

      if (!lead) {
        return res.status(404).json({ error: "Lead não encontrado" });
      }

      // Check company access
      if (req.user?.role !== 'admin' && lead.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const updatedLead = await storage.updateLead(id, req.body);
      res.json(updatedLead);
    } catch (error) {
      console.error("Update lead error:", error);
      res.status(500).json({ error: "Erro ao atualizar lead" });
    }
  });

  app.delete("/api/leads/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const lead = await storage.getLead(id);

      if (!lead) {
        return res.status(404).json({ error: "Lead não encontrado" });
      }

      // Check company access
      if (req.user?.role !== 'admin' && lead.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      await storage.deleteLead(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete lead error:", error);
      res.status(500).json({ error: "Erro ao excluir lead" });
    }
  });

  // Convert lead to customer
  app.post("/api/leads/:id/convert", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { funnelStageId } = req.body;

      const lead = await storage.getLead(id);

      if (!lead) {
        return res.status(404).json({ error: "Lead não encontrado" });
      }

      // Check company access
      if (req.user?.role !== 'admin' && lead.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      // Create customer from lead
      const customerData = insertCustomerSchema.parse({
        companyId: lead.companyId,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        funnelStageId: funnelStageId,
        source: lead.source,
        notes: lead.notes,
      });

      const customer = await storage.createCustomer(customerData);

      // Update lead to mark as converted
      await storage.updateLead(id, {
        convertedToCustomer: true,
        customerId: customer.id,
        status: 'converted'
      });

      res.json({ customer, lead: await storage.getLead(id) });
    } catch (error) {
      console.error("Convert lead error:", error);
      res.status(500).json({ error: "Erro ao converter lead" });
    }
  });

  // Property endpoints
  app.get("/api/properties", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const properties = await storage.getPropertiesByCompany(req.user.companyId);
      res.json(properties);
    } catch (error) {
      console.error("Get properties error:", error);
      res.status(500).json({ error: "Erro ao buscar imóveis" });
    }
  });

  app.post("/api/properties", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      // Adiciona companyId antes da validação para que o schema passe
      const bodyWithCompanyId = {
        ...req.body,
        companyId: req.user?.companyId!,
      };

      console.log("🔍 [PROPERTY CREATE] Request body:", JSON.stringify(bodyWithCompanyId, null, 2));

      const result = insertPropertySchema.safeParse(bodyWithCompanyId);
      if (!result.success) {
        console.error("🔍 [PROPERTY CREATE] Validation failed:", JSON.stringify(result.error.errors, null, 2));
        return res.status(400).json({ error: result.error.errors });
      }

      console.log("🔍 [PROPERTY CREATE] Final property data:", JSON.stringify(result.data, null, 2));

      const property = await storage.createProperty(result.data);
      res.status(201).json(property);
    } catch (error) {
      console.error("Create property error:", error);
      res.status(500).json({ error: "Erro ao criar imóvel" });
    }
  });

  app.put("/api/properties/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const property = await storage.getProperty(id);
      
      if (!property) {
        return res.status(404).json({ error: "Imóvel não encontrado" });
      }

      // Check company access
      if (req.user?.role !== 'admin' && property.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const result = insertPropertySchema.partial().safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error.errors });
      }

      const updatedProperty = await storage.updateProperty(id, result.data);
      res.json(updatedProperty);
    } catch (error) {
      console.error("Update property error:", error);
      res.status(500).json({ error: "Erro ao atualizar imóvel" });
    }
  });

  app.delete("/api/properties/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const property = await storage.getProperty(id);
      
      if (!property) {
        return res.status(404).json({ error: "Imóvel não encontrado" });
      }

      // Check company access
      if (req.user?.role !== 'admin' && property.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      await storage.deleteProperty(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete property error:", error);
      res.status(500).json({ error: "Erro ao excluir imóvel" });
    }
  });

  // Upload property images
  app.post("/api/properties/upload-images", authenticate, requireClient, uploadPropertyImages.array('images', 5), async (req: AuthRequest, res) => {
    try {
      if (!req.files || !Array.isArray(req.files)) {
        return res.status(400).json({ error: "Nenhuma imagem enviada" });
      }

      const files = req.files as Express.Multer.File[];
      const imagePaths = files.map(file => `/uploads/properties/${file.filename}`);

      res.json({ 
        message: "Imagens enviadas com sucesso",
        images: imagePaths
      });
    } catch (error) {
      console.error("Upload images error:", error);
      res.status(500).json({ error: "Erro ao fazer upload das imagens" });
    }
  });

  // Delete property image
  app.delete("/api/properties/images", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { imagePath } = req.body;

      if (!imagePath) {
        return res.status(400).json({ error: "Caminho da imagem é obrigatório" });
      }

      // Extract filename from path and construct full file path
      const filename = path.basename(imagePath);
      const fullPath = path.join(process.cwd(), 'uploads', 'properties', filename);

      // Check if file exists and delete it
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        res.json({ message: "Imagem excluída com sucesso" });
      } else {
        res.status(404).json({ error: "Imagem não encontrada" });
      }
    } catch (error) {
      console.error("Delete image error:", error);
      res.status(500).json({ error: "Erro ao excluir imagem" });
    }
  });

  // ========== TOOLS FOR CHATGPT INTEGRATION ==========

  // Search properties tool for ChatGPT
  app.post("/api/tools/busca_imoveis", async (req, res) => {
    try {
      const { agentId, cidade, tipo_transacao, tipo_imovel } = req.body;

      if (!agentId) {
        return res.status(400).json({
          error: "agentId é obrigatório",
          description: "O campo agentId identifica o agente de IA que está fazendo a busca. Este ID é fornecido automaticamente no prompt do agente."
        });
      }

      // Buscar o agente para obter o companyId
      const agent = await storage.getAiAgent(agentId);
      if (!agent) {
        return res.status(404).json({
          error: "Agente não encontrado",
          description: `Nenhum agente encontrado com o ID: ${agentId}`
        });
      }

      const companyId = agent.companyId;
      console.log(`🤖 [BUSCA_IMOVEIS] Agent: ${agent.name} (${agentId})`);
      console.log(`🏢 [BUSCA_IMOVEIS] Company: ${companyId}`);

      // Build filters object
      const filters: any = {};

      if (cidade) {
        filters.city = cidade;
      }

      if (tipo_transacao) {
        // Normalize transaction type (aluguel -> locacao, venda -> venda)
        if (tipo_transacao.toLowerCase() === 'aluguel') {
          filters.transactionType = 'locacao';
        } else if (tipo_transacao.toLowerCase() === 'venda') {
          filters.transactionType = 'venda';
        } else {
          filters.transactionType = tipo_transacao;
        }
      }

      if (tipo_imovel) {
        filters.propertyType = tipo_imovel;
      }

      console.log(`🔍 [BUSCA_IMOVEIS] Searching properties with filters:`, { companyId, filters });

      const properties = await storage.searchProperties(companyId, filters);

      console.log(`✅ [BUSCA_IMOVEIS] Found ${properties.length} properties`);

      // Return properties with full details
      res.json({
        total: properties.length,
        imoveis: properties.map(p => ({
          id: p.id,
          codigo: p.code,
          nome: p.name,
          endereco: {
            rua: p.street,
            numero: p.number,
            proximidade: p.proximity,
            bairro: p.neighborhood,
            cidade: p.city,
            estado: p.state,
            cep: p.zipCode,
            localizacao_mapa: p.mapLocation
          },
          caracteristicas: {
            area_privada: p.privateArea,
            vagas_garagem: p.parkingSpaces,
            banheiros: p.bathrooms,
            quartos: p.bedrooms,
            comodidades: p.amenities || []
          },
          descricao: p.description,
          tipo_transacao: p.transactionType,
          imagens: p.images || [],
          video_youtube: p.youtubeVideoUrl,
          destaque: p.featured,
          status: p.status,
          criado_em: p.createdAt,
          atualizado_em: p.updatedAt
        }))
      });
    } catch (error) {
      console.error("❌ [BUSCA_IMOVEIS] Error searching properties:", error);
      res.status(500).json({
        error: "Erro ao buscar imóveis",
        details: error.message
      });
    }
  });

  // Amenities (Comodidades) routes
  app.get("/api/amenities", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(400).json({ error: "Company ID não encontrado" });
      }

      const amenities = await storage.getAmenitiesByCompany(req.user.companyId);
      res.json(amenities);
    } catch (error) {
      console.error("Error fetching amenities:", error);
      res.status(500).json({ error: "Erro ao buscar comodidades" });
    }
  });

  app.post("/api/amenities", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(400).json({ error: "Company ID não encontrado" });
      }

      const amenityData = {
        ...req.body,
        companyId: req.user.companyId
      };

      const amenity = await storage.createAmenity(amenityData);
      res.json(amenity);
    } catch (error) {
      console.error("Error creating amenity:", error);
      res.status(500).json({ error: "Erro ao criar comodidade" });
    }
  });

  app.put("/api/amenities/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const amenity = await storage.getAmenity(id);
      if (!amenity) {
        return res.status(404).json({ error: "Comodidade não encontrada" });
      }

      if (amenity.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Não autorizado" });
      }

      const updated = await storage.updateAmenity(id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating amenity:", error);
      res.status(500).json({ error: "Erro ao atualizar comodidade" });
    }
  });

  app.delete("/api/amenities/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const amenity = await storage.getAmenity(id);
      if (!amenity) {
        return res.status(404).json({ error: "Comodidade não encontrada" });
      }

      if (amenity.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Não autorizado" });
      }

      await storage.deleteAmenity(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting amenity:", error);
      res.status(500).json({ error: "Erro ao deletar comodidade" });
    }
  });

  // Cities (Cidades) routes
  app.get("/api/cities", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(400).json({ error: "Company ID não encontrado" });
      }

      const cities = await storage.getCitiesByCompany(req.user.companyId);
      res.json(cities);
    } catch (error) {
      console.error("Error fetching cities:", error);
      res.status(500).json({ error: "Erro ao buscar cidades" });
    }
  });

  app.post("/api/cities", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(400).json({ error: "Company ID não encontrado" });
      }

      const cityData = {
        ...req.body,
        companyId: req.user.companyId
      };

      const city = await storage.createCity(cityData);
      res.json(city);
    } catch (error) {
      console.error("Error creating city:", error);
      res.status(500).json({ error: "Erro ao criar cidade" });
    }
  });

  app.put("/api/cities/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const city = await storage.getCity(id);
      if (!city) {
        return res.status(404).json({ error: "Cidade não encontrada" });
      }

      if (city.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Não autorizado" });
      }

      const updated = await storage.updateCity(id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating city:", error);
      res.status(500).json({ error: "Erro ao atualizar cidade" });
    }
  });

  app.delete("/api/cities/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const city = await storage.getCity(id);
      if (!city) {
        return res.status(404).json({ error: "Cidade não encontrada" });
      }

      if (city.companyId !== req.user?.companyId) {
        return res.status(403).json({ error: "Não autorizado" });
      }

      await storage.deleteCity(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting city:", error);
      res.status(500).json({ error: "Erro ao deletar cidade" });
    }
  });

  // Debug route to check customers table and data
  app.get("/api/debug/customers", async (req, res) => {
    try {
      const storage = getStorage();
      
      // Get MySQL connection from storage
      const connection = (storage as any).connection;
      if (!connection) {
        throw new Error('No database connection');
      }

      // Check if customers table exists
      const [tables] = await connection.execute(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'customers'
      `, [process.env.MYSQL_DATABASE]);

      // Get table structure if exists
      let structure = [];
      if (tables.length > 0) {
        const [columns] = await connection.execute(`DESCRIBE customers`);
        structure = columns;
      }

      // Try to get customers count
      let customersCount = 0;
      let customersData = [];
      if (tables.length > 0) {
        try {
          const [countResult] = await connection.execute(`SELECT COUNT(*) as count FROM customers`);
          customersCount = countResult[0].count;
          
          const [customers] = await connection.execute(`SELECT * FROM customers LIMIT 5`);
          customersData = customers;
        } catch (error) {
          console.log("Error getting customers data:", error.message);
        }
      }

      res.json({ 
        tableExists: tables.length > 0,
        structure,
        customersCount,
        customersData
      });
    } catch (error) {
      console.error("Error debugging customers:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Temporary route to add transaction_type column
  app.post("/api/add-transaction-type-column", async (req, res) => {
    try {
      const storage = getStorage();
      
      // Get MySQL connection from storage
      const connection = (storage as any).connection;
      if (!connection) {
        throw new Error('No database connection');
      }

      // Add transaction_type column
      await connection.execute(`
        ALTER TABLE properties 
        ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(20) NOT NULL DEFAULT 'venda'
      `);

      res.json({ success: true, message: "Transaction type column added successfully" });
    } catch (error) {
      console.error("Error adding transaction_type column:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Temporary route to update properties table structure
  app.post("/api/update-properties-table", async (req, res) => {
    try {
      const storage = getStorage();
      
      // Get MySQL connection from storage
      const connection = (storage as any).connection;
      if (!connection) {
        throw new Error('No database connection');
      }

      // Update properties table to make fields optional
      await connection.execute(`
        ALTER TABLE properties 
        MODIFY COLUMN neighborhood VARCHAR(100),
        MODIFY COLUMN city VARCHAR(100),
        MODIFY COLUMN state VARCHAR(2),
        MODIFY COLUMN zip_code VARCHAR(10),
        MODIFY COLUMN bedrooms INT NOT NULL DEFAULT 0
      `);

      res.json({ success: true, message: "Properties table updated successfully" });
    } catch (error) {
      console.error("Error updating properties table:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Temporary route to create properties table
  app.post("/api/create-properties-table", async (req, res) => {
    try {
      const storage = getStorage();
      
      // Get MySQL connection from storage
      const connection = (storage as any).connection;
      if (!connection) {
        throw new Error('No database connection');
      }

      // Create properties table
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS properties (
          id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
          company_id VARCHAR(36) NOT NULL,
          code VARCHAR(50) NOT NULL,
          name VARCHAR(255) NOT NULL,
          street VARCHAR(255) NOT NULL,
          number VARCHAR(20) NOT NULL,
          proximity VARCHAR(255),
          neighborhood VARCHAR(100),
          city VARCHAR(100),
          state VARCHAR(2),
          zip_code VARCHAR(10),
          private_area DECIMAL(8,2) NOT NULL,
          parking_spaces INT NOT NULL DEFAULT 0,
          bathrooms INT NOT NULL DEFAULT 1,
          bedrooms INT NOT NULL DEFAULT 0,
          description TEXT,
          map_location VARCHAR(500),
          transaction_type VARCHAR(20) NOT NULL DEFAULT 'venda',
          status VARCHAR(20) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      // Try to add transaction_type column if table already exists
      try {
        await connection.execute(`
          ALTER TABLE properties 
          ADD COLUMN transaction_type VARCHAR(20) NOT NULL DEFAULT 'venda'
        `);
      } catch (alterError) {
        // Column might already exist, ignore the error
        console.log("Column transaction_type might already exist");
      }

      res.json({ success: true, message: "Properties table created successfully" });
    } catch (error) {
      console.error("Error creating properties table:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============ Custom Domains Endpoints ============

  // CLIENT: Get custom domains for company
  app.get("/api/client/domains", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const domains = await storage.getCustomDomainsByCompany(req.user.companyId);
      const latestDomain = await storage.getLatestCustomDomainByCompany(req.user.companyId);

      res.json({ domains, latestDomain });
    } catch (error) {
      console.error("Get custom domains error:", error);
      res.status(500).json({ error: "Erro ao buscar domínios customizados" });
    }
  });

  // CLIENT: Request custom domain
  app.post("/api/client/domains/request", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      const { requestedDomain } = req.body;

      if (!requestedDomain) {
        return res.status(400).json({ error: "Domínio é obrigatório" });
      }

      // Validate domain format (basic validation)
      const domainRegex = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
      const cleanDomain = requestedDomain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');

      if (!domainRegex.test(cleanDomain)) {
        return res.status(400).json({ error: "Formato de domínio inválido. Exemplo: meudominio.com" });
      }

      // Check if domain already exists and is active
      const existingDomain = await storage.getCustomDomainByHost(cleanDomain);
      if (existingDomain && existingDomain.status === 1) {
        return res.status(400).json({ error: "Este domínio já está em uso por outra empresa" });
      }

      // Get current domain (latest connected)
      const currentDomains = await storage.getCustomDomainsByCompany(req.user.companyId);
      const connectedDomain = currentDomains.find(d => d.status === 1);

      // Check if requesting current domain
      if (connectedDomain?.requestedDomain === cleanDomain) {
        return res.status(400).json({ error: "Este já é seu domínio atual" });
      }

      // Create custom domain request
      const domainData = {
        companyId: req.user.companyId,
        requestedDomain: cleanDomain,
        currentDomain: connectedDomain?.requestedDomain || null,
        status: 0 // Pending
      };

      const customDomain = await storage.createCustomDomain(domainData);

      res.json({
        message: "Solicitação de domínio criada com sucesso. Aguarde aprovação do administrador.",
        domain: customDomain
      });
    } catch (error) {
      console.error("Request custom domain error:", error);
      res.status(500).json({ error: "Erro ao solicitar domínio customizado" });
    }
  });

  // ADMIN: Get all custom domains
  app.get("/api/admin/custom-domains", authenticate, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { status } = req.query;

      let domains;
      if (status && !isNaN(Number(status))) {
        domains = await storage.getCustomDomainsByStatus(Number(status));
      } else {
        domains = await storage.getAllCustomDomains();
      }

      // Enrich with company data
      const domainsWithCompanies = await Promise.all(
        domains.map(async (domain) => {
          const company = await storage.getCompany(domain.companyId);
          return {
            ...domain,
            company
          };
        })
      );

      res.json(domainsWithCompanies);
    } catch (error) {
      console.error("Get all custom domains error:", error);
      res.status(500).json({ error: "Erro ao buscar domínios customizados" });
    }
  });

  // ADMIN: Update custom domain status
  app.put("/api/admin/custom-domains/:id/status", authenticate, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (status === undefined || ![0, 1, 2, 3].includes(status)) {
        return res.status(400).json({ error: "Status inválido. Use 0 (Pending), 1 (Connected), 2 (Rejected) ou 3 (Removed)" });
      }

      const domain = await storage.getCustomDomain(id);
      if (!domain) {
        return res.status(404).json({ error: "Domínio não encontrado" });
      }

      // Update status
      const updatedDomain = await storage.updateCustomDomain(id, { status });

      // Get company data for email
      const company = await storage.getCompany(domain.companyId);

      // Send email notification
      const emailService = getEmailService();

      if (status === 1 && company?.email) {
        // Approved
        await emailService.sendCustomDomainApprovedEmail({
          companyName: company.name,
          companyEmail: company.email,
          requestedDomain: domain.requestedDomain || '',
          currentDomain: domain.currentDomain || undefined,
          status: 'approved'
        });
      } else if (status === 2 && company?.email) {
        // Rejected
        await emailService.sendCustomDomainRejectedEmail({
          companyName: company.name,
          companyEmail: company.email,
          requestedDomain: domain.requestedDomain || '',
          currentDomain: domain.currentDomain || undefined,
          status: 'rejected'
        });
      }

      res.json({
        message: "Status atualizado com sucesso",
        domain: updatedDomain
      });
    } catch (error) {
      console.error("Update custom domain status error:", error);
      res.status(500).json({ error: "Erro ao atualizar status do domínio" });
    }
  });

  // ADMIN: Delete custom domain
  app.delete("/api/admin/custom-domains/:id", authenticate, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const domain = await storage.getCustomDomain(id);
      if (!domain) {
        return res.status(404).json({ error: "Domínio não encontrado" });
      }

      await storage.deleteCustomDomain(id);

      res.json({ message: "Domínio deletado com sucesso" });
    } catch (error) {
      console.error("Delete custom domain error:", error);
      res.status(500).json({ error: "Erro ao deletar domínio" });
    }
  });

  // ADMIN: Send custom email to company about domain
  app.post("/api/admin/custom-domains/:id/send-email", authenticate, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { subject, message } = req.body;

      if (!subject || !message) {
        return res.status(400).json({ error: "Assunto e mensagem são obrigatórios" });
      }

      const domain = await storage.getCustomDomain(id);
      if (!domain) {
        return res.status(404).json({ error: "Domínio não encontrado" });
      }

      const company = await storage.getCompany(domain.companyId);
      if (!company?.email) {
        return res.status(400).json({ error: "Empresa não possui email cadastrado" });
      }

      const emailService = getEmailService();
      const sent = await emailService.sendCustomEmail(company.email, subject, message);

      if (sent) {
        res.json({ message: "Email enviado com sucesso" });
      } else {
        res.status(500).json({ error: "Falha ao enviar email. Verifique as configurações SMTP." });
      }
    } catch (error) {
      console.error("Send custom email error:", error);
      res.status(500).json({ error: "Erro ao enviar email" });
    }
  });

  // ============================================
  // WEBSITE TEMPLATES ROUTES
  // ============================================

  // Get all available templates (public/authenticated)
  app.get("/api/website-templates", async (req, res) => {
    try {
      const storage = getStorage();
      const templates = await storage.getAllWebsiteTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Get templates error:", error);
      res.status(500).json({ error: "Erro ao buscar templates" });
    }
  });

  // Get company website configuration
  app.get("/api/client/website", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const storage = getStorage();

      const website = await storage.getCompanyWebsite(user.companyId);
      res.json(website || null);
    } catch (error) {
      console.error("Get company website error:", error);
      res.status(500).json({ error: "Erro ao buscar configuração do website" });
    }
  });

  // Create or update company website configuration
  app.post("/api/client/website", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const storage = getStorage();
      const { templateId, config } = req.body;

      if (!templateId || !config) {
        return res.status(400).json({ error: "Template ID e configuração são obrigatórios" });
      }

      // Verify template exists
      const template = await storage.getWebsiteTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template não encontrado" });
      }

      // Check if website already exists
      const existing = await storage.getCompanyWebsite(user.companyId);

      let result;
      if (existing) {
        result = await storage.updateCompanyWebsite(existing.id, { templateId, config });
      } else {
        result = await storage.createCompanyWebsite({
          companyId: user.companyId,
          templateId,
          config,
          isActive: true,
        });
      }

      res.json(result);
    } catch (error) {
      console.error("Save company website error:", error);
      res.status(500).json({ error: "Erro ao salvar configuração do website" });
    }
  });

  // ============================================
  // COMPANY AGENTS ROUTES
  // ============================================

  // Get all agents for company
  app.get("/api/client/agents", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const storage = getStorage();

      const agents = await storage.getCompanyAgentsByCompany(user.companyId);
      res.json(agents);
    } catch (error) {
      console.error("Get agents error:", error);
      res.status(500).json({ error: "Erro ao buscar corretores" });
    }
  });

  // Get active agents only
  app.get("/api/client/agents/active", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const storage = getStorage();

      const agents = await storage.getActiveCompanyAgents(user.companyId);
      res.json(agents);
    } catch (error) {
      console.error("Get active agents error:", error);
      res.status(500).json({ error: "Erro ao buscar corretores ativos" });
    }
  });

  // Create new agent
  app.post("/api/client/agents", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const storage = getStorage();

      const agent = await storage.createCompanyAgent({
        ...req.body,
        companyId: user.companyId,
      });

      res.json(agent);
    } catch (error) {
      console.error("Create agent error:", error);
      res.status(500).json({ error: "Erro ao criar corretor" });
    }
  });

  // Update agent
  app.put("/api/client/agents/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const user = req.user!;
      const storage = getStorage();

      // Verify agent belongs to company
      const agent = await storage.getCompanyAgent(id);
      if (!agent || agent.companyId !== user.companyId) {
        return res.status(404).json({ error: "Corretor não encontrado" });
      }

      const updated = await storage.updateCompanyAgent(id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Update agent error:", error);
      res.status(500).json({ error: "Erro ao atualizar corretor" });
    }
  });

  // Delete agent
  app.delete("/api/client/agents/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const user = req.user!;
      const storage = getStorage();

      // Verify agent belongs to company
      const agent = await storage.getCompanyAgent(id);
      if (!agent || agent.companyId !== user.companyId) {
        return res.status(404).json({ error: "Corretor não encontrado" });
      }

      await storage.deleteCompanyAgent(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete agent error:", error);
      res.status(500).json({ error: "Erro ao deletar corretor" });
    }
  });

  // ============================================
  // COMPANY TESTIMONIALS ROUTES
  // ============================================

  // Get all testimonials for company
  app.get("/api/client/testimonials", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const storage = getStorage();

      const testimonials = await storage.getCompanyTestimonialsByCompany(user.companyId);
      res.json(testimonials);
    } catch (error) {
      console.error("Get testimonials error:", error);
      res.status(500).json({ error: "Erro ao buscar depoimentos" });
    }
  });

  // Get active testimonials only
  app.get("/api/client/testimonials/active", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const storage = getStorage();

      const testimonials = await storage.getActiveCompanyTestimonials(user.companyId);
      res.json(testimonials);
    } catch (error) {
      console.error("Get active testimonials error:", error);
      res.status(500).json({ error: "Erro ao buscar depoimentos ativos" });
    }
  });

  // Create new testimonial
  app.post("/api/client/testimonials", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const storage = getStorage();

      const testimonial = await storage.createCompanyTestimonial({
        ...req.body,
        companyId: user.companyId,
      });

      res.json(testimonial);
    } catch (error) {
      console.error("Create testimonial error:", error);
      res.status(500).json({ error: "Erro ao criar depoimento" });
    }
  });

  // Update testimonial
  app.put("/api/client/testimonials/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const user = req.user!;
      const storage = getStorage();

      // Verify testimonial belongs to company
      const testimonial = await storage.getCompanyTestimonial(id);
      if (!testimonial || testimonial.companyId !== user.companyId) {
        return res.status(404).json({ error: "Depoimento não encontrado" });
      }

      const updated = await storage.updateCompanyTestimonial(id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Update testimonial error:", error);
      res.status(500).json({ error: "Erro ao atualizar depoimento" });
    }
  });

  // Delete testimonial
  app.delete("/api/client/testimonials/:id", authenticate, requireClient, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const user = req.user!;
      const storage = getStorage();

      // Verify testimonial belongs to company
      const testimonial = await storage.getCompanyTestimonial(id);
      if (!testimonial || testimonial.companyId !== user.companyId) {
        return res.status(404).json({ error: "Depoimento não encontrado" });
      }

      await storage.deleteCompanyTestimonial(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete testimonial error:", error);
      res.status(500).json({ error: "Erro ao deletar depoimento" });
    }
  });

  // ============================================
  // TEMPORARY ROUTES
  // ============================================

  // Temporary route to create customers table
  app.post("/api/create-customers-table", async (req, res) => {
    try {
      const storage = getStorage();

      // Get MySQL connection from storage
      const connection = (storage as any).connection;
      if (!connection) {
        throw new Error('No database connection');
      }

      // Create customers table
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS customers (
          id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
          company_id VARCHAR(36) NOT NULL,
          name VARCHAR(255) NOT NULL,
          phone VARCHAR(20) NOT NULL,
          email VARCHAR(255),
          company VARCHAR(255),
          funnel_stage_id VARCHAR(36) NOT NULL,
          last_contact TIMESTAMP,
          notes TEXT,
          value DECIMAL(10,2),
          source VARCHAR(255) DEFAULT 'WhatsApp',
          conversation_id VARCHAR(36),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY customers_phone_company_unique (phone, company_id)
        )
      `);

      res.json({ success: true, message: "Customers table created successfully" });
    } catch (error) {
      console.error("Error creating customers table:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
