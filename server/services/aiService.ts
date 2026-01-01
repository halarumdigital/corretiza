import OpenAI from "openai";
import fs from 'fs';
import path from 'path';
import { getStorage } from "../storage";
import { propertyService } from "./propertyService";
import { EvolutionApiService } from "./evolutionApi";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user

export interface MessageContext {
  phone: string;
  message: string;
  instanceId: string;
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  mediaUrl?: string;
  mediaBase64?: string;
  caption?: string;
  mimeType?: string;
  messageType?: string;
  pushName?: string; // Nome do contato no WhatsApp
}

export interface PropertyData {
  code: string;
  name: string;
  endereco: string;
  description: string;
  images: string[];
}

export interface AgentResponse {
  response: string;
  shouldDelegate?: boolean;
  delegatedAgentId?: string;
  activeAgentId?: string;
  activeAgentName?: string;
  activeAgentType?: string;
  propertyImages?: string[]; // URLs das imagens dos imóveis encontrados (deprecated - usar properties)
  properties?: PropertyData[]; // Dados estruturados dos imóveis para envio sequencial
  hasMoreProperties?: boolean; // Indica se há mais imóveis disponíveis para mostrar
}

export class AIService {
  async processMessage(context: MessageContext): Promise<AgentResponse | null> {
    const aiProcessId = Math.random().toString(36).substr(2, 9);
    const startTime = Date.now();

    try {
      console.log(`🤖 [AI-${aiProcessId}] ========================================`);
      console.log(`🤖 [AI-${aiProcessId}] AIService.processMessage called`);
      console.log(`🤖 [AI-${aiProcessId}] Instance: ${context.instanceId}`);
      console.log(`🤖 [AI-${aiProcessId}] Phone: ${context.phone}`);
      console.log(`🤖 [AI-${aiProcessId}] Message: "${context.message}"`);
      console.log(`🤖 [AI-${aiProcessId}] Message type: ${context.messageType || 'text'}`);
      console.log(`🤖 [AI-${aiProcessId}] Has media: ${!!context.mediaBase64}`);
      console.log(`🤖 [AI-${aiProcessId}] Push name: ${context.pushName || 'none'}`);

      const storage = getStorage();

      // Buscar a instância diretamente pelo evolutionInstanceId
      let instance = await storage.getWhatsappInstanceByEvolutionId(context.instanceId);

      // Se não encontrou e temos um databaseInstanceId, usar ele
      if (!instance && (context as any).databaseInstanceId) {
        console.log(`🔄 Using databaseInstanceId as fallback: ${(context as any).databaseInstanceId}`);
        instance = await storage.getWhatsappInstance((context as any).databaseInstanceId);
      }

      // Sem fallbacks hardcoded - usar apenas o que está no banco
      
      if (!instance) {
        console.error(`❌ [AI-${aiProcessId}] No instance found for instanceId: ${context.instanceId}`);
        return null;
      }

      console.log(`✅ [AI-${aiProcessId}] Instance found: ${instance.name} (DB ID: ${instance.id})`);

      if (!instance.aiAgentId) {
        console.error(`❌ [AI-${aiProcessId}] No agent linked to instance ${instance.name}. AgentId: ${instance.aiAgentId}`);
        return null;
      }

      console.log(`🔗 [AI-${aiProcessId}] Instance has agent linked: ${instance.aiAgentId}`);

      // Buscar o agente principal
      console.log(`🔍 Looking for agent with ID: ${instance.aiAgentId}`);
      const mainAgent = await storage.getAiAgent(instance.aiAgentId);
      if (!mainAgent) {
        console.error(`❌ [AI-${aiProcessId}] Agent ${instance.aiAgentId} not found in database`);
        return null;
      }

      console.log(`✅ [AI-${aiProcessId}] Agent found: ${mainAgent.name}`);
      console.log(`🔍 [AI-${aiProcessId}] Agent details:`, {
        id: mainAgent.id,
        name: mainAgent.name,
        agentType: mainAgent.agentType,
        hasOpenAIKey: !!mainAgent.openaiApiKey,
        hasPrompt: !!mainAgent.prompt,
        promptLength: mainAgent.prompt?.length || 0
      });

      // Verificar se deve delegar para um agente secundário
      console.log(`🔍 Verificando delegação para agente principal: ${mainAgent.name}`);
      const delegatedAgent = await this.checkDelegation(mainAgent, context.message);
      const activeAgent = delegatedAgent || mainAgent;
      
      if (delegatedAgent) {
        console.log(`🔄 DELEGAÇÃO ATIVADA! Mudando de "${mainAgent.name}" para "${delegatedAgent.name}"`);
      } else {
        console.log(`📋 Sem delegação. Usando agente principal: ${mainAgent.name}`);
      }

      // Buscar configuração global de IA (nível administrador)
      const aiConfig = await storage.getAiConfiguration();
      console.log(`🔍 DEBUG: AI Config retrieved:`, aiConfig);
      if (!aiConfig) {
        console.log(`❌ Global AI config not found`);
        return null;
      }
      
      if (!aiConfig.apiKey) {
        console.log(`❌ AI Config exists but apiKey is missing:`, aiConfig);
        return null;
      }
      
      console.log(`✅ AI Config found with apiKey: ${aiConfig.apiKey ? 'YES (length: ' + aiConfig.apiKey.length + ')' : 'NO'}`);
      console.log(`🔧 AI Config details:`, {
        temperatura: aiConfig.temperatura,
        temperaturaType: typeof aiConfig.temperatura,
        numeroTokens: aiConfig.numeroTokens,
        numeroTokensType: typeof aiConfig.numeroTokens,
        modelo: aiConfig.modelo,
        apiKeyPrefix: aiConfig.apiKey ? aiConfig.apiKey.substring(0, 10) + '...' : 'NONE'
      });
      console.log(`✅ Agent found: ${mainAgent.name}, ID: ${mainAgent.id}`);

      // Buscar histórico da conversa ANTES de gerar resposta
      console.log(`📚 [DEBUG] Carregando histórico da conversa para ${context.phone}...`);
      console.log(`📚 [DEBUG] InstanceId recebido: ${context.instanceId}`);
      console.log(`📚 [DEBUG] DatabaseInstanceId disponível: ${(context as any).databaseInstanceId || 'NÃO DISPONÍVEL'}`);

      let conversationHistory: Array<{role: 'user' | 'assistant', content: string}> = [];
      try {
        // CORREÇÃO: Usar databaseInstanceId se disponível, pois é o ID real do banco
        // O evolutionInstanceId pode ser um UUID diferente do que está salvo no banco
        const instanceIdParaHistorico = (context as any).databaseInstanceId || context.instanceId;
        console.log(`📚 [DEBUG] Usando instanceId para histórico: ${instanceIdParaHistorico}`);
        conversationHistory = await this.getConversationHistory(instanceIdParaHistorico, context.phone);
        console.log(`📚 [DEBUG] Histórico carregado com SUCESSO: ${conversationHistory.length} mensagens`);
        
        if (conversationHistory.length > 0) {
          console.log(`📚 [DEBUG] Últimas mensagens do histórico:`, conversationHistory.slice(-3));
        }
      } catch (error) {
        console.error(`❌ [DEBUG] Erro ao carregar histórico:`, error);
        conversationHistory = [];
      }
      
      const contextWithHistory = {
        ...context,
        conversationHistory
      };
      
      console.log(`📚 [DEBUG] Context com histórico preparado - Total mensagens: ${conversationHistory.length}`);
      
      // Gerar resposta usando OpenAI
      console.log(`🤖 Gerando resposta com agente ativo: ${activeAgent.name} (Tipo: ${activeAgent.agentType || 'main'})`);
      console.log(`🔑 Testando inicialização OpenAI com chave: ${aiConfig.apiKey ? aiConfig.apiKey.substring(0, 8) + '...' : 'MISSING'}`);

      const responseData = await this.generateResponse(activeAgent, contextWithHistory, aiConfig);

      return {
        response: responseData.text,
        shouldDelegate: !!delegatedAgent,
        delegatedAgentId: delegatedAgent?.id,
        activeAgentId: activeAgent.id, // ID do agente que realmente respondeu
        activeAgentName: activeAgent.name,
        activeAgentType: activeAgent.agentType || 'main',
        propertyImages: responseData.propertyImages, // deprecated
        properties: responseData.properties, // novo formato estruturado
        hasMoreProperties: responseData.hasMoreProperties // indica se há mais imóveis disponíveis
      };

    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`❌ [AI-${aiProcessId}] CRITICAL ERROR processing message after ${totalTime}ms:`, error);
      console.error(`❌ [AI-${aiProcessId}] ERROR STACK:`, error.stack);
      console.error(`❌ [AI-${aiProcessId}] ERROR MESSAGE:`, error.message);
      console.error(`❌ [AI-${aiProcessId}] ERROR TYPE:`, error.constructor.name);
      console.error(`❌ [AI-${aiProcessId}] CONTEXT:`, {
        instanceId: context.instanceId,
        phone: context.phone,
        messageLength: context.message?.length || 0,
        messageType: context.messageType
      });
      return null;
    }
  }

  private async getConversationHistory(instanceIdOrDbId: string, phone: string): Promise<Array<{role: 'user' | 'assistant', content: string}>> {
    try {
      console.log(`📚 [HISTORY] ========== INICIANDO BUSCA DE HISTÓRICO ==========`);
      console.log(`📚 [HISTORY] instanceIdOrDbId: "${instanceIdOrDbId}"`);
      console.log(`📚 [HISTORY] phone: "${phone}"`);
      const storage = getStorage();

      // Verificar se o ID recebido já é um ID do banco (formato UUID do nosso banco)
      // ou se é um evolutionInstanceId que precisa ser convertido
      let dbInstanceId: string = instanceIdOrDbId;
      let conversations: any[] = [];

      // Tentar usar diretamente como ID do banco primeiro
      console.log(`📚 [HISTORY] Tentando usar ID diretamente como dbInstanceId...`);
      conversations = await storage.getConversationsByInstance(instanceIdOrDbId);

      if (conversations && conversations.length >= 0) {
        // O ID funcionou diretamente como ID do banco
        console.log(`✅ [HISTORY] ID usado diretamente como dbInstanceId: ${dbInstanceId}`);
      } else {
        // Fallback: tentar encontrar pelo evolutionInstanceId
        console.log(`📚 [HISTORY] ID não funcionou diretamente, buscando via findDatabaseInstanceId...`);
        const foundDbId = await this.findDatabaseInstanceId(instanceIdOrDbId);
        if (!foundDbId) {
          console.log(`❌ [HISTORY] Instância do banco não encontrada para: ${instanceIdOrDbId}`);
          return [];
        }
        dbInstanceId = foundDbId;
        console.log(`✅ [HISTORY] Instância encontrada via fallback: ${dbInstanceId}`);
        // Buscar conversas com o ID correto
        conversations = await storage.getConversationsByInstance(dbInstanceId);
      }
      console.log(`📚 [HISTORY] Total de conversas encontradas: ${conversations.length}`);

      // Log detalhado de todas as conversas para debug
      conversations.forEach((c, idx) => {
        console.log(`📚 [HISTORY] Conversa [${idx}]: phone="${c.contactPhone}", id="${c.id}"`);
      });

      // Normalizar telefone para comparação (remover caracteres especiais)
      const normalizePhone = (p: string) => p.replace(/\D/g, '');
      const phoneNormalized = normalizePhone(phone);

      console.log(`📚 [HISTORY] Buscando conversa para phone normalizado: "${phoneNormalized}"`);

      // Buscar por telefone exato OU normalizado
      let conversation = conversations.find(c => c.contactPhone === phone);
      if (!conversation) {
        conversation = conversations.find(c => normalizePhone(c.contactPhone) === phoneNormalized);
        if (conversation) {
          console.log(`✅ [HISTORY] Conversa encontrada via phone normalizado!`);
        }
      }

      if (!conversation) {
        console.log(`❌ [HISTORY] Nenhuma conversa encontrada para ${phone} (normalizado: ${phoneNormalized})`);
        console.log(`📚 [HISTORY] Phones das conversas disponíveis:`, conversations.map(c => ({
          original: c.contactPhone,
          normalized: normalizePhone(c.contactPhone)
        })));
        return [];
      }
      
      console.log(`✅ [HISTORY] Conversa encontrada: ${conversation.id} para telefone ${phone}`);
      
      // Buscar mensagens da conversa
      console.log(`📚 [HISTORY] Buscando mensagens da conversa ${conversation.id}...`);
      const messages = await storage.getMessagesByConversation(conversation.id);
      console.log(`📚 [HISTORY] Encontradas ${messages.length} mensagens na conversa`);
      
      if (messages.length > 0) {
        console.log(`📚 [HISTORY] Primeiras mensagens:`, messages.slice(0, 3).map(m => ({ sender: m.sender, content: m.content.substring(0, 50) + '...' })));
      }
      
      // Converter para formato OpenAI (últimas 50 mensagens para contexto completo)
      const history = messages
        .sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateA - dateB;
        })
        .slice(-50)
        .map(msg => {
          console.log(`📝 [HISTORY] Mapeando mensagem - sender: "${msg.sender}", content: "${msg.content.substring(0, 50)}..."`);
          return {
            role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
            content: msg.content
          };
        });

      console.log(`✅ [HISTORY] Histórico formatado com SUCESSO: ${history.length} mensagens`);
      if (history.length > 0) {
        console.log(`📚 [HISTORY] Histórico completo formatado:`);
        history.forEach((msg, index) => {
          console.log(`  [${index}] ${msg.role}: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
        });
      }

      return history;
      
    } catch (error) {
      console.error("❌ [HISTORY] Erro ao carregar histórico da conversa:", error);
      console.error("❌ [HISTORY] Stack trace:", error instanceof Error ? error.stack : 'No stack trace');
      return [];
    }
  }

  async findDatabaseInstanceId(evolutionInstanceIdOrName: string): Promise<string | null> {
    try {
      console.log(`🔍 [FIND] Buscando instância do banco para: "${evolutionInstanceIdOrName}"`);
      const storage = getStorage();
      const companies = await storage.getAllCompanies();

      for (const company of companies) {
        const instances = await storage.getWhatsappInstancesByCompany(company.id);

        // Buscar por evolutionInstanceId OU nome da instância
        let found = instances.find(i =>
          i.evolutionInstanceId === evolutionInstanceIdOrName ||
          i.name === evolutionInstanceIdOrName
        );

        // Fallback específico para IDs conhecidos
        if (!found && evolutionInstanceIdOrName === "e5b71c35-276b-417e-a1c3-267f904b2b98") {
          found = instances.find(i => i.name === "deploy2");
        }

        // Fallback para o ID atual do deploy10
        if (!found && evolutionInstanceIdOrName === "4d0f0895-9c71-4199-b48d-a3df4e3de3da") {
          found = instances.find(i => i.name === "deploy10");
        }

        if (found) {
          console.log(`✅ [FIND] Mapeamento encontrado: input="${evolutionInstanceIdOrName}" -> dbId="${found.id}", name="${found.name}", evolutionId="${found.evolutionInstanceId}"`);
          return found.id;
        }
      }

      console.log(`❌ [FIND] Nenhuma instância encontrada para: "${evolutionInstanceIdOrName}"`);
      return null;
    } catch (error) {
      console.error("❌ [FIND] Erro ao buscar instância do banco:", error);
      return null;
    }
  }

  private async checkDelegation(mainAgent: any, message: string): Promise<any | null> {
    try {
      const storage = getStorage();
      
      // Buscar agentes secundários vinculados ao agente principal
      const secondaryAgents = await storage.getSecondaryAgentsByParent(mainAgent.id);
      console.log(`🔗 Agentes secundários encontrados: ${secondaryAgents.length}`);
      
      if (!secondaryAgents || secondaryAgents.length === 0) {
        console.log(`❌ Nenhum agente secundário vinculado ao agente principal "${mainAgent.name}"`);
        return null;
      }

      // Verificar palavras-chave de delegação (mesma lógica do AiResponseService)
      const messageLower = message.toLowerCase();
      console.log(`🔍 Verificando delegação entre ${secondaryAgents.length} agentes secundários`);
      
      for (const agent of secondaryAgents) {
        if (agent.delegationKeywords && Array.isArray(agent.delegationKeywords) && agent.delegationKeywords.length > 0) {
          const keywords = agent.delegationKeywords;
          const hasKeyword = keywords.some(keyword => 
            messageLower.includes(keyword.toLowerCase())
          );
          
          if (hasKeyword) {
            console.log(`✅ Palavras-chave encontradas para delegação ao agente: ${agent.name}`);
            console.log(`🔑 Keywords: ${agent.delegationKeywords.join(', ')}`);
            return agent;
          }
        }
      }

      return null;
    } catch (error) {
      console.error("Error checking delegation:", error);
      return null;
    }
  }

  private async generateResponse(agent: any, context: MessageContext, aiConfig: any): Promise<{text: string, propertyImages?: string[], properties?: PropertyData[], hasMoreProperties?: boolean}> {
    try {
      console.log(`🤖 [GENERATE] Starting generateResponse for agent: ${agent.name}`);
      console.log(`🔑 [GENERATE] API Key exists: ${!!aiConfig.apiKey}, length: ${aiConfig.apiKey?.length || 0}`);
      
      // Verificar se temos a chave OpenAI na configuração do administrador
      if (!aiConfig.apiKey) {
        return { text: "Desculpe, o serviço de IA não está configurado. Entre em contato com o administrador." };
      }

      // Criar instância do OpenAI com a chave da configuração
      console.log(`🔧 [GENERATE] Creating OpenAI instance...`);
      const openai = new OpenAI({ apiKey: aiConfig.apiKey });
      console.log(`✅ [GENERATE] OpenAI instance created successfully`);

      // Construir o prompt do sistema baseado no agente (usando lógica do AiResponseService)
      let systemPrompt = agent.prompt || `Você é ${agent.name}, um assistente de IA especializado.`;

      // 📅 ADICIONAR DATA ATUAL PARA O AGENTE SABER O DIA DE HOJE
      const hoje = new Date();
      const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
      const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      const dataFormatada = `${diasSemana[hoje.getDay()]}, ${hoje.getDate().toString().padStart(2, '0')}/${(hoje.getMonth() + 1).toString().padStart(2, '0')}/${hoje.getFullYear()}`;

      systemPrompt += `\n\n=== DATA E HORA ATUAL ===\n`;
      systemPrompt += `HOJE É: ${dataFormatada}\n`;
      systemPrompt += `Ano atual: ${hoje.getFullYear()}\n`;
      systemPrompt += `Mês atual: ${meses[hoje.getMonth()]} (${hoje.getMonth() + 1})\n`;
      systemPrompt += `IMPORTANTE: Use esta data como referência para calcular datas FUTURAS de agendamentos!\n`;
      systemPrompt += `=== FIM DATA ATUAL ===\n\n`;

      console.log(`📅 [DATA] Data atual injetada no prompt: ${dataFormatada}`);

      // 👤 ADICIONAR INFORMAÇÃO SOBRE O NOME DO USUÁRIO
      const isFirstMessage = !context.conversationHistory || context.conversationHistory.length === 0;
      console.log(`👤 [NOME] ========================================`);
      console.log(`👤 [NOME] pushName no context: "${context.pushName}"`);
      console.log(`👤 [NOME] É primeira mensagem: ${isFirstMessage}`);

      if (context.pushName) {
        console.log(`✅ [NOME] Nome do usuário DISPONÍVEL: "${context.pushName}"`);

        systemPrompt += `\n\n=== INFORMAÇÃO DO USUÁRIO ===\n`;
        systemPrompt += `Nome do usuário: ${context.pushName}\n`;
        systemPrompt += `=== FIM INFORMAÇÃO DO USUÁRIO ===\n\n`;

        if (isFirstMessage) {
          systemPrompt += `IMPORTANTE: Esta é a PRIMEIRA mensagem do usuário. Cumprimente-o DIRETAMENTE pelo nome "${context.pushName}" de forma calorosa e amigável. Use o nome real do usuário, NÃO use placeholders como {{contact_name}}. O nome é: ${context.pushName}\n\n`;
          console.log(`👋 [SAUDAÇÃO] Instruindo agente a cumprimentar ${context.pushName} na primeira mensagem`);
        } else {
          systemPrompt += `Você pode e DEVE usar o nome "${context.pushName}" para se referir ao usuário de forma pessoal. NÃO use placeholders como {{contact_name}}, use diretamente: ${context.pushName}\n\n`;
        }
      } else {
        console.log(`⚠️ [NOME] pushName NÃO DISPONÍVEL no contexto`);
        if (isFirstMessage) {
          systemPrompt += `\nIMPORTANTE: Esta é a PRIMEIRA mensagem do usuário. Cumprimente-o de forma calorosa e amigável. Seja acolhedor e demonstre que você está à disposição para ajudá-lo.\n\n`;
        }
      }

      // Adicionar conhecimento base se disponível
      if (agent.trainingContent && agent.trainingContent.trim()) {
        systemPrompt += `\n\n=== CONHECIMENTO BASE ===\n${agent.trainingContent}\n=== FIM CONHECIMENTO BASE ===\n\n`;
        systemPrompt += `Use as informações do CONHECIMENTO BASE acima para responder às perguntas do usuário de forma precisa e detalhada.`;
      }

      // 🏠 BUSCAR IMÓVEIS SE O USUÁRIO PERGUNTAR SOBRE PROPRIEDADES
      let propertiesContext = '';
      const storage = getStorage();

      // Obter a instância para determinar a empresa
      const instance = await storage.getWhatsappInstanceByEvolutionId(context.instanceId);
      if (!instance && (context as any).databaseInstanceId) {
        const dbInstance = await storage.getWhatsappInstance((context as any).databaseInstanceId);
        if (dbInstance) {
          Object.assign(instance || {}, dbInstance);
        }
      }

      // Detectar se é uma busca de imóveis para forçar o function calling
      // IMPORTANTE: Verificar tanto a mensagem atual quanto o HISTÓRICO
      // Exemplo: Se usuário disse "apartamento" antes e agora diz "joaçaba", ainda é busca de imóveis!

      // Lista de cidades conhecidas (expandida)
      const cidadesConhecidas = [
        'joaçaba', 'joacaba', 'joaçabas', 'campinas', 'são paulo', 'sao paulo', 'curitiba',
        'florianópolis', 'florianopolis', 'joinville', 'blumenau', 'chapecó', 'chapeco', 'lages',
        'criciúma', 'criciuma', 'itajaí', 'itajai', 'jaraguá', 'jaragua', 'balneário', 'balneario',
        'herval', "herval d'oeste", 'herval do oeste', 'catanduvas', 'ibicaré', 'ibicare',
        'treze tílias', 'treze tilias', 'água doce', 'agua doce', 'lacerdópolis', 'lacerdopolis',
        'ouro', 'capinzal', 'erval velho', 'vargem bonita', 'tangará', 'tangara',
        'piratuba', 'ipira', 'peritiba', 'presidente castelo branco', 'jaborá', 'jabora',
        'concórdia', 'concordia', 'videira', 'fraiburgo', 'caçador', 'cacador'
      ];

      // Lista de tipos de imóvel (expandida)
      const tiposImovelKeywords = [
        'apartamento', 'apartamentos', 'ap', 'apto', 'aptos',
        'casa', 'casas',
        'sobrado', 'sobrados',
        'sala', 'salas', 'sala comercial', 'salas comerciais',
        'terreno', 'terrenos', 'lote', 'lotes',
        'chácara', 'chacara', 'chácaras', 'chacaras', 'sitio', 'sítio',
        'imovel', 'imóvel', 'imoveis', 'imóveis',
        'kitnet', 'kitnets', 'kitinete', 'kitinetes',
        'cobertura', 'coberturas',
        'galpão', 'galpao', 'galpões', 'galpoes',
        'barracão', 'barracao', 'barracões', 'barracoes'
      ];

      const messageLower = context.message.toLowerCase();

      console.log(`🔍 [PROPERTY_SEARCH] ========== DETECTANDO BUSCA DE IMÓVEIS ==========`);
      console.log(`🔍 [PROPERTY_SEARCH] Mensagem atual: "${context.message}"`);
      console.log(`🔍 [PROPERTY_SEARCH] Histórico existe: ${!!context.conversationHistory}`);
      console.log(`🔍 [PROPERTY_SEARCH] Histórico length: ${context.conversationHistory?.length || 0}`);
      console.log(`🔍 [PROPERTY_SEARCH] instance?.companyId: ${instance?.companyId}`);

      // SEMPRE montar o texto completo: histórico + mensagem atual
      // Isso garante que mesmo com histórico vazio, analisamos a conversa completa
      const historicoTextoCompleto = [
        ...(context.conversationHistory || []).map(m => m.content.toLowerCase()),
        messageLower
      ].join(' ');

      console.log(`🔍 [PROPERTY_SEARCH] historicoTextoCompleto (hist+atual): "${historicoTextoCompleto.substring(0, 300)}..."`);

      // Verificar se mensagem atual tem keyword de busca
      let isPropertySearch = instance?.companyId && propertyService.isPropertySearchIntent(context.message);
      console.log(`🔍 [PROPERTY_SEARCH] isPropertySearchIntent(mensagem atual): ${propertyService.isPropertySearchIntent(context.message)}`);
      console.log(`🔍 [PROPERTY_SEARCH] isPropertySearch inicial: ${isPropertySearch}`);

      // NOVA LÓGICA: Verificar se no texto COMPLETO (histórico + atual) há cidade E tipo
      // Isso funciona MESMO quando o histórico está vazio
      if (!isPropertySearch && instance?.companyId) {
        // Verificar se o texto completo menciona tipo de imóvel
        const textoTemTipo = tiposImovelKeywords.some(tipo => historicoTextoCompleto.includes(tipo));
        // Verificar se o texto completo menciona cidade
        const textoTemCidade = cidadesConhecidas.some(cidade => historicoTextoCompleto.includes(cidade));

        console.log(`🔍 [PROPERTY_SEARCH] textoTemTipo (no texto completo): ${textoTemTipo}`);
        console.log(`🔍 [PROPERTY_SEARCH] textoTemCidade (no texto completo): ${textoTemCidade}`);

        // Se o texto completo tem AMBOS tipo e cidade = é busca!
        if (textoTemTipo && textoTemCidade) {
          isPropertySearch = true;
          console.log(`🏠 [AI] ✅ DETECTADA BUSCA COMPLETA: Tipo + Cidade no texto completo - FORÇANDO FUNCTION CALLING`);
        }
      }

      // LÓGICA ADICIONAL: Se não detectou ainda, verificar mensagem atual vs histórico separadamente
      if (!isPropertySearch && instance?.companyId && context.conversationHistory && context.conversationHistory.length > 0) {
        const historicoText = context.conversationHistory.map(m => m.content.toLowerCase()).join(' ');

        // Verificar se a mensagem atual é uma cidade
        const mensagemEhCidade = cidadesConhecidas.some(cidade => messageLower.includes(cidade));
        // Verificar se o histórico menciona tipo de imóvel
        const historicoMencionaTipo = tiposImovelKeywords.some(tipo => historicoText.includes(tipo));

        console.log(`🔍 [PROPERTY_SEARCH] historicoText (só histórico): "${historicoText.substring(0, 200)}..."`);
        console.log(`🔍 [PROPERTY_SEARCH] mensagemEhCidade: ${mensagemEhCidade}`);
        console.log(`🔍 [PROPERTY_SEARCH] historicoMencionaTipo: ${historicoMencionaTipo}`);

        // Se a mensagem atual é uma cidade E o histórico menciona tipo de imóvel = é busca!
        if (mensagemEhCidade && historicoMencionaTipo) {
          isPropertySearch = true;
          console.log(`🏠 [AI] ✅ Detectada busca: CIDADE atual + TIPO no histórico - FORÇANDO FUNCTION CALLING`);
        }

        // Verificar também o contrário: mensagem atual tem tipo E histórico tem cidade
        const mensagemTemTipo = tiposImovelKeywords.some(tipo => messageLower.includes(tipo));
        const historicoMencionaCidade = cidadesConhecidas.some(cidade => historicoText.includes(cidade));
        console.log(`🔍 [PROPERTY_SEARCH] mensagemTemTipo: ${mensagemTemTipo}`);
        console.log(`🔍 [PROPERTY_SEARCH] historicoMencionaCidade: ${historicoMencionaCidade}`);

        if (mensagemTemTipo && historicoMencionaCidade) {
          isPropertySearch = true;
          console.log(`🏠 [AI] ✅ Detectada busca: TIPO atual + CIDADE no histórico - FORÇANDO FUNCTION CALLING`);
        }
      } else if (!isPropertySearch) {
        console.log(`🔍 [PROPERTY_SEARCH] ⚠️ Verificação de histórico separado não executada. Condições: isPropertySearch=${isPropertySearch}, companyId=${!!instance?.companyId}, historyLength=${context.conversationHistory?.length || 0}`);
      }

      // 🔄 NOVA LÓGICA: Detectar pedido de "ver mais" imóveis
      // Se o usuário pedir "mais", "quero ver mais", "próximos", etc - forçar busca_imoveis
      if (!isPropertySearch && instance?.companyId) {
        const pedidoMaisKeywords = ['mais', 'quero ver mais', 'mostre mais', 'tem mais', 'próximos', 'proximos', 'outros', 'outras opções', 'outras opcoes'];
        const ehPedidoMais = pedidoMaisKeywords.some(kw => messageLower.includes(kw));

        // Verificar se no histórico já houve busca de imóveis (indicado por presença de "Encontrei" ou códigos de imóveis)
        const historicoMencionaBusca = context.conversationHistory?.some(m =>
          m.content.toLowerCase().includes('encontrei') ||
          m.content.toLowerCase().includes('imóveis') ||
          m.content.toLowerCase().includes('imoveis') ||
          /[A-Z]\d{3,4}/.test(m.content) // Padrão de código de imóvel como A1001
        );

        console.log(`🔄 [VER_MAIS] ehPedidoMais: ${ehPedidoMais}`);
        console.log(`🔄 [VER_MAIS] historicoMencionaBusca: ${historicoMencionaBusca}`);

        if (ehPedidoMais && historicoMencionaBusca) {
          isPropertySearch = true;
          console.log(`🔄 [AI] ✅ Detectado pedido de VER MAIS imóveis - FORÇANDO FUNCTION CALLING`);
        }
      }

      console.log(`🔍 [PROPERTY_SEARCH] isPropertySearch FINAL: ${isPropertySearch}`);
      console.log(`🔍 [PROPERTY_SEARCH] ================================================`);

      if (isPropertySearch) {
        console.log(`🏠 [AI] ✅ Detectada intenção de busca de imóveis - FORÇANDO FUNCTION CALLING`);
      } else {
        console.log(`🏠 [AI] ❌ Não detectada busca de imóveis - tool_choice será "auto"`);
      }

      // Adicionar contexto de delegação se for agente secundário
      if (agent.agentType === 'secondary') {
        systemPrompt += `\n\nVocê é um agente especializado. Responda com base em sua especialização e conhecimento específico.`;
      }

      // Instruções sobre busca de imóveis - OBRIGATÓRIO usar a tool busca_imoveis

      systemPrompt += `\n\n⚠️⚠️⚠️ REGRA CRÍTICA SOBRE BUSCA DE IMÓVEIS ⚠️⚠️⚠️

🏠 QUANDO USAR A FUNÇÃO busca_imoveis:
Você DEVE chamar a função busca_imoveis SEMPRE que o usuário:
- Mencionar tipos de imóvel: "apartamento", "casa", "sala", "terreno", "sobrado", "chácara", "ap", "apto"
- Perguntar sobre imóveis disponíveis
- Mencionar cidades ou localizações para buscar imóveis
- Pedir para ver, mostrar ou buscar imóveis
- Demonstrar interesse em alugar ou comprar

IMPORTANTE: Você NÃO tem acesso aos imóveis sem usar a função busca_imoveis!
Se o usuário perguntar sobre imóveis e você NÃO chamar a função, você não terá dados para responder.

🔍 ANTES DE CHAMAR busca_imoveis:
- SEMPRE passe TODOS os parâmetros que você conseguir identificar
- Se o usuário mencionou "apartamento", "casa", "sala", "terreno", "sobrado" ou "chácara" em QUALQUER mensagem (atual ou histórico), você DEVE passar tipo_imovel
- Se o usuário mencionou uma cidade, você DEVE passar cidade
- Se o usuário mencionou "alugar", "locação", "venda", "comprar", você DEVE passar tipo_transacao
- NUNCA chame busca_imoveis sem passar tipo_imovel se o usuário mencionou o tipo do imóvel
- Analise TODO o histórico da conversa para identificar esses parâmetros

QUANDO você chamar a função busca_imoveis:
- Responda APENAS: "Encontrei X imóveis! Vou te mostrar:" (NO MÁXIMO 1-2 linhas)
- NÃO LISTE OS IMÓVEIS
- NÃO MENCIONE nomes, endereços, quartos, banheiros, vagas, área, preços
- NÃO INCLUA detalhes, descrições ou características
- NÃO MOSTRE links de imagens
- O SISTEMA enviará automaticamente cada imóvel completo com suas fotos
- Sua resposta após busca_imoveis = APENAS mensagem de introdução

EXEMPLOS CORRETOS:
✅ "Encontrei 5 apartamentos! Vou te mostrar:"
✅ "Achei 12 imóveis! Mostrando os primeiros 3:"
✅ "Mais 3 imóveis para você! Veja:"

EXEMPLOS ERRADOS:
❌ "Encontrei 5 apartamentos: 1. Apto Centro - 3 quartos..."
❌ "Veja esses imóveis: Apartamento tal, Casa tal..."

🔄 QUANDO O USUÁRIO PEDIR MAIS IMÓVEIS:
Quando o usuário digitar "mais", "quero ver mais", "mostre mais", "próximos", "outros":
- Chame a função busca_imoveis NOVAMENTE com os MESMOS parâmetros anteriores
- O sistema automaticamente calcula o offset e mostra os próximos 3 imóveis
- Responda: "Mais opções para você! Veja:" (mensagem curta)
- O sistema continuará mostrando de 3 em 3 até acabar

🚨 FORÇAR FUNCTION CALL:
Se o usuário mencionou QUALQUER tipo de imóvel E/OU cidade, você DEVE chamar a função busca_imoveis imediatamente!
NÃO faça perguntas adicionais, NÃO peça esclarecimentos, NÃO diga que vai procurar.
SIMPLESMENTE CHAME A FUNÇÃO com os parâmetros que você conseguiu identificar!

Responda sempre em português brasileiro de forma natural e helpful.

📅 REGRAS DE AGENDAMENTO DE VISITAS:

FLUXO OBRIGATÓRIO (SIGA EXATAMENTE):
1. Após mostrar os imóveis → PERGUNTE: "Qual imóvel você gostou mais? Vamos agendar uma visita sem compromisso?"
2. Quando o usuário informar o CÓDIGO do imóvel → PERGUNTE o nome completo
3. Quando o usuário informar o nome → PERGUNTE o telefone com DDD
4. Quando o usuário informar o telefone → OFEREÇA 3 OPÇÕES DE HORÁRIO para visita
5. SOMENTE quando tiver os 4 dados (código + nome + telefone + horário escolhido) → CHAME agendar_visita

IMPORTANTE - OFERTA DE HORÁRIOS:
- SEMPRE ofereça 3 opções de horários disponíveis para a visita
- Use dias úteis (segunda a sexta) nos PRÓXIMOS 7 DIAS (datas FUTURAS, nunca a data de hoje)
- Ofereça horários comerciais variados (manhã e tarde): 9h, 10h, 14h, 15h, 16h
- CRÍTICO: Sempre inclua DIA, MÊS e ANO completos no formato "dia DD/MM/YYYY"
- Formato OBRIGATÓRIO: "Tenho disponível: Quinta dia 02/01/2026 às 9h, Segunda dia 06/01/2026 às 14h, ou Quarta dia 08/01/2026 às 16h. Qual prefere?"
- ATENÇÃO À VIRADA DE ANO: Se estamos em dezembro 2025, as datas de janeiro serão de 2026!
- NUNCA ofereça a data de hoje - sempre datas FUTURAS
- AGUARDE o usuário escolher o horário antes de chamar agendar_visita
- Quando o usuário escolher, passe a data COMPLETA COM ANO no parâmetro data_visita (ex: "Sexta dia 02/01/2026 às 16h")

IMPORTANTE - NÃO USE DADOS AUTOMÁTICOS:
- NÃO use o pushName do WhatsApp como nome - PERGUNTE ao usuário
- NÃO use o número do WhatsApp como telefone - PERGUNTE ao usuário
- SEMPRE colete os dados PERGUNTANDO ao usuário

Exemplo de fluxo correto:
- Usuário: "A1004"
- Agente: "Ótima escolha! Para agendar uma visita ao imóvel A1004, preciso de alguns dados. Qual é o seu nome completo?"
- Usuário: "João Silva"
- Agente: "Perfeito, João! Agora me informe seu telefone com DDD para contato."
- Usuário: "47 99999-9999"
- Agente: "Ótimo! Tenho disponível: Quinta dia 02/01/2026 às 9h, Segunda dia 06/01/2026 às 14h, ou Quarta dia 08/01/2026 às 16h. Qual horário você prefere?"
- Usuário: "Quarta às 14h"
- Agente: [AGORA SIM chama agendar_visita com data_visita="Quarta dia 08/01/2026 às 14h"]\n\n`;
      systemPrompt += `IMPORTANTE: SEMPRE siga o prompt e personalidade definidos no início desta mensagem. Não mude seu comportamento ou tom.`;

      // PRÉ-PROCESSAR: Detectar cidade e tipo no histórico para evitar loops
      // MAS: NÃO fazer busca automática se mensagem atual for cumprimento
      let contextInfo = "";
      const mensagemAtual = context.message.toLowerCase().trim();
      const cumprimentos = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'hello', 'opa'];
      const ehCumprimento = cumprimentos.some(c => mensagemAtual === c || mensagemAtual.startsWith(c + ' '));

      if (context.conversationHistory && context.conversationHistory.length > 0 && !ehCumprimento) {
        const conversationText = context.conversationHistory
          .map(m => m.content.toLowerCase())
          .join(' ');

        // Detectar cidade
        const cidades = ['joaçaba', 'joacaba', 'campinas', 'são paulo', 'sao paulo', 'curitiba', 'florianópolis', 'florianopolis'];
        let cidadeDetectada = null;
        for (const c of cidades) {
          if (conversationText.includes(c)) {
            cidadeDetectada = c.charAt(0).toUpperCase() + c.slice(1);
            break;
          }
        }

        // Detectar tipo de imóvel
        const tiposImovel = ['apartamento', 'ap', 'apto', 'casa', 'sobrado', 'sala', 'terreno', 'chácara', 'chacara'];
        let tipoDetectado = null;
        for (const tipo of tiposImovel) {
          if (conversationText.includes(tipo)) {
            tipoDetectado = tipo === 'ap' || tipo === 'apto' ? 'apartamento' : tipo;
            break;
          }
        }

        // Se detectou cidade E tipo, adicionar ao contexto
        if (cidadeDetectada && tipoDetectado) {
          contextInfo = `\n\nCONTEXTO DA CONVERSA: O usuário já informou que procura "${tipoDetectado}" em "${cidadeDetectada}". Use a função busca_imoveis com esses parâmetros IMEDIATAMENTE, sem fazer mais perguntas.`;
          console.log(`🔍 [PRE-PROCESS] Detectado no histórico: ${tipoDetectado} em ${cidadeDetectada}`);
        } else if (cidadeDetectada) {
          contextInfo = `\n\nCONTEXTO DA CONVERSA: O usuário já informou a cidade "${cidadeDetectada}".`;
          console.log(`🔍 [PRE-PROCESS] Detectado no histórico: cidade ${cidadeDetectada}`);
        } else if (tipoDetectado) {
          contextInfo = `\n\nCONTEXTO DA CONVERSA: O usuário já informou que procura "${tipoDetectado}".`;
          console.log(`🔍 [PRE-PROCESS] Detectado no histórico: tipo ${tipoDetectado}`);
        }
      } else if (ehCumprimento) {
        console.log(`👋 [PRE-PROCESS] Mensagem atual é cumprimento - NÃO fazer busca automática`);
      }

      // Construir histórico da conversa
      const messages: any[] = [
        { role: "system", content: systemPrompt + contextInfo }
      ];

      // Adicionar histórico se disponível
      console.log(`📚 [GENERATE] ========================================`);
      console.log(`📚 [GENERATE] Verificando histórico da conversa`);
      console.log(`📚 [GENERATE] context.conversationHistory existe: ${!!context.conversationHistory}`);
      console.log(`📚 [GENERATE] context.conversationHistory.length: ${context.conversationHistory?.length || 0}`);

      if (context.conversationHistory && context.conversationHistory.length > 0) {
        console.log(`✅ [GENERATE] HISTÓRICO ENCONTRADO! Adicionando ${context.conversationHistory.length} mensagens`);
        console.log(`📚 [GENERATE] Histórico completo:`, JSON.stringify(context.conversationHistory, null, 2));
        messages.push(...context.conversationHistory.slice(-50)); // Últimas 50 mensagens
        console.log(`📚 [GENERATE] Total de mensagens enviadas para OpenAI: ${messages.length} (1 system + ${Math.min(context.conversationHistory.length, 50)} histórico)`);
      } else {
        console.log(`❌ [GENERATE] NENHUM HISTÓRICO DISPONÍVEL - tratando como primeira mensagem`);
        console.log(`❌ [GENERATE] Isso significa que o agente NÃO vai lembrar de mensagens anteriores!`);
      }

      // Adicionar mensagem atual (com suporte a imagem e áudio)
      console.log(`🔍 [MEDIA CHECK] messageType: ${context.messageType}, has mediaBase64: ${!!context.mediaBase64}`);
      console.log(`🔍 [MEDIA CHECK] mediaBase64 length: ${context.mediaBase64?.length || 0}`);
      console.log(`🔍 [MEDIA CHECK] mimeType: ${context.mimeType}`);
      
      // PROCESSAR ÁUDIO PRIMEIRO (transcrever para texto)
      if (context.messageType === 'audio' && context.mediaBase64) {
        console.log(`🎤 ✅ PROCESSANDO ÁUDIO COM WHISPER!`);
        try {
          // Converter base64 para buffer
          const audioBuffer = Buffer.from(context.mediaBase64, 'base64');
          console.log(`🎤 Audio buffer size: ${audioBuffer.length} bytes`);
          
          // Salvar temporariamente em arquivo para OpenAI Whisper
          const tmpDir = '/tmp';
          const tmpFile = path.join(tmpDir, `audio_${Date.now()}.ogg`);
          
          fs.writeFileSync(tmpFile, audioBuffer);
          console.log(`🎤 Arquivo temporário criado: ${tmpFile}`);
          
          // Transcrever usando OpenAI Whisper
          const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tmpFile),
            model: "whisper-1",
          });
          
          console.log(`🎤 ✅ TRANSCRIÇÃO CONCLUÍDA!`);
          console.log(`🎤 Texto transcrito: "${transcription.text}"`);
          
          // Limpar arquivo temporário
          fs.unlinkSync(tmpFile);
          console.log(`🎤 Arquivo temporário removido`);
          
          // Usar o texto transcrito como mensagem
          context.message = transcription.text || "Não foi possível transcrever o áudio";
          
        } catch (error) {
          console.error("❌ Erro na transcrição de áudio:", error);
          context.message = "Desculpe, não consegui processar o áudio enviado.";
        }
      }
      
      if ((context.messageType === 'image' || context.messageType === 'imageMessage') && context.mediaBase64) {
        console.log(`🖼️ ✅ ENTRANDO NO PROCESSAMENTO DE IMAGEM!`);
        console.log(`🖼️ Image details: type=${context.mimeType}, size=${context.mediaBase64.length} chars`);
        
        // Usar o mimeType correto detectado pela detecção de magic bytes
        const mimeType = context.mimeType || 'image/jpeg';
        
        const userMessage: any = {
          role: "user",
          content: [
            {
              type: "text",
              text: context.caption ? `${context.message}\n\nDescrição da imagem: ${context.caption}` : context.message
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${context.mediaBase64}`
              }
            }
          ]
        };
        messages.push(userMessage);
      } else {
        messages.push({ role: "user", content: context.message });
      }

      // Gerar resposta usando OpenAI
      console.log(`🔧 [OPENAI] Pre-OpenAI call - temperatura: ${aiConfig.temperatura}, type: ${typeof aiConfig.temperatura}`);
      console.log(`🔧 [OPENAI] Pre-OpenAI call - numeroTokens: ${aiConfig.numeroTokens}, type: ${typeof aiConfig.numeroTokens}`);
      console.log(`🔧 [OPENAI] Messages count: ${messages.length}, has image: ${context.messageType === 'image' || context.messageType === 'imageMessage'}`);
      console.log(`🔧 [OPENAI] About to call OpenAI API...`);

      // Definir tools disponíveis
      const tools = [
        {
          type: "function" as const,
          function: {
            name: "busca_imoveis",
            description: "OBRIGATÓRIO: Use esta função SEMPRE que o usuário mencionar QUALQUER tipo de imóvel (apartamento, casa, sala, terreno, sobrado, chácara, ap, apto) OU cidade. NÃO FAÇA PERGUNTAS - chame a função imediatamente! Busca imóveis cadastrados no banco de dados da empresa. Retorna 3 imóveis por vez. Se o usuário pedir 'mais' ou 'mostre mais', chame a função novamente para retornar os próximos 3. IMPORTANTE: Utilize TODAS as informações fornecidas pelo usuário (cidade, tipo de imóvel, tipo de transação) tanto na mensagem atual quanto no histórico da conversa. SEMPRE passe os parâmetros que você conseguir identificar.",
            parameters: {
              type: "object",
              properties: {
                cidade: {
                  type: "string",
                  description: "Nome da cidade onde o usuário procura imóvel. Exemplos: Joaçaba, Campinas, São Paulo. Extraia da mensagem atual ou do histórico da conversa."
                },
                tipo_transacao: {
                  type: "string",
                  enum: ["venda", "aluguel", "locacao"],
                  description: "Tipo de transação desejada pelo usuário. Use 'venda' se o usuário quer comprar, 'aluguel' ou 'locacao' se quer alugar. Extraia da mensagem atual ou do histórico."
                },
                tipo_imovel: {
                  type: "string",
                  enum: ["apartamento", "casa", "sala", "terreno", "sobrado", "chácara"],
                  description: "CRÍTICO: Tipo específico do imóvel que o usuário procura. Valores aceitos: 'apartamento', 'casa', 'sala', 'terreno', 'sobrado', 'chácara'. Se o usuário mencionar 'ap', 'apto' = use 'apartamento'. SEMPRE forneça este parâmetro quando o usuário mencionar o tipo (ex: 'quero um apartamento', 'procuro casa', etc). Extraia da mensagem atual ou do histórico da conversa."
                },
                limite: {
                  type: "number",
                  description: "Número máximo de imóveis a retornar. Padrão: 3. O sistema mostra de 3 em 3 automaticamente."
                }
              },
              required: []
            }
          }
        },
        {
          type: "function" as const,
          function: {
            name: "agendar_visita",
            description: "ATENÇÃO: Só chame esta função quando tiver coletado TODOS os 4 dados na conversa: 1) Código do imóvel, 2) Nome completo do cliente (PERGUNTE se não souber), 3) Telefone com DDD (PERGUNTE se não souber), 4) Data/hora da visita ESCOLHIDA pelo cliente entre as opções oferecidas. Se faltar QUALQUER dado, NÃO chame a função - pergunte ao usuário primeiro!",
            parameters: {
              type: "object",
              properties: {
                nome_cliente: {
                  type: "string",
                  description: "Nome COMPLETO informado pelo cliente durante a conversa. Se não foi informado, PERGUNTE antes de chamar esta função."
                },
                telefone_cliente: {
                  type: "string",
                  description: "Telefone COM DDD informado pelo cliente. Se não foi informado, PERGUNTE antes de chamar esta função."
                },
                imovel_interesse: {
                  type: "string",
                  description: "Código do imóvel escolhido pelo cliente (ex: A1001, A1002)."
                },
                data_visita: {
                  type: "string",
                  description: "Data e hora da visita ESCOLHIDA pelo cliente. Formato OBRIGATÓRIO com DIA/MÊS/ANO: 'Segunda dia 06/01/2026 às 9h' ou 'Sexta dia 02/01/2026 às 16h'. SEMPRE inclua o ANO na data! ATENÇÃO na virada de ano: se estamos em dezembro 2025, janeiro será 2026. NUNCA use a data de hoje - apenas datas FUTURAS."
                },
                observacoes: {
                  type: "string",
                  description: "Observações adicionais."
                }
              },
              required: ["nome_cliente", "telefone_cliente", "imovel_interesse", "data_visita"]
            }
          }
        }
      ];

      // Se detectou intenção de busca de imóveis, FORÇAR a chamada da tool
      // tool_choice: "auto" = modelo decide | "required" = forçado a chamar alguma tool
      // tool_choice: {type: "function", function: {name: "X"}} = forçar tool específica
      const toolChoice = isPropertySearch
        ? { type: "function" as const, function: { name: "busca_imoveis" } }
        : "auto" as const;

      console.log(`🔧 [OPENAI] tool_choice: ${JSON.stringify(toolChoice)}`);
      console.log(`🔧 [OPENAI] isPropertySearch: ${isPropertySearch}`);

      const response = await openai.chat.completions.create({
        model: aiConfig.modelo || "gpt-4o",
        messages: messages,
        max_tokens: Number(aiConfig.numeroTokens) || 1000,
        temperature: Number(aiConfig.temperatura) || 0.7,
        tools: tools,
        tool_choice: toolChoice
      });

      console.log(`✅ [OPENAI] OpenAI call successful`);
      console.log(`🔍 [OPENAI_DEBUG] Response object:`, JSON.stringify(response, null, 2));

      const responseMessage = response.choices[0].message;
      console.log(`🔍 [OPENAI_DEBUG] Response message:`, JSON.stringify(responseMessage, null, 2));
      console.log(`🔍 [OPENAI_DEBUG] Has tool_calls: ${!!responseMessage.tool_calls}`);
      console.log(`🔍 [OPENAI_DEBUG] Tool_calls length: ${responseMessage.tool_calls?.length || 0}`);
      console.log(`🔍 [OPENAI_DEBUG] Message content: ${responseMessage.content?.substring(0, 100) || 'null'}`);

      // Verificar se o modelo quer chamar uma função
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        console.log(`🛠️ [FUNCTION_CALL] Modelo solicitou chamada de função!`);

        const toolCall = responseMessage.tool_calls[0];
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        console.log(`🛠️ [FUNCTION_CALL] Função: ${functionName}`);
        console.log(`🛠️ [FUNCTION_CALL] Argumentos RAW (do OpenAI):`, JSON.stringify(functionArgs, null, 2));
        console.log(`🛠️ [FUNCTION_CALL] tipo_imovel do OpenAI:`, functionArgs.tipo_imovel, '(type:', typeof functionArgs.tipo_imovel, ')');
        console.log(`🛠️ [FUNCTION_CALL] cidade do OpenAI:`, functionArgs.cidade, '(type:', typeof functionArgs.cidade, ')');
        console.log(`🛠️ [FUNCTION_CALL] tipo_transacao do OpenAI:`, functionArgs.tipo_transacao, '(type:', typeof functionArgs.tipo_transacao, ')');

        if (functionName === "busca_imoveis") {
          try {
            // Buscar instância para obter companyId
            let instanceForSearch = await storage.getWhatsappInstanceByEvolutionId(context.instanceId);
            if (!instanceForSearch && (context as any).databaseInstanceId) {
              instanceForSearch = await storage.getWhatsappInstance((context as any).databaseInstanceId);
            }

            if (!instanceForSearch?.companyId) {
              throw new Error('Instância ou companyId não encontrado');
            }

            console.log(`🏢 [FUNCTION_CALL] CompanyId encontrado: ${instanceForSearch.companyId}`);

            // Extrair parâmetros do histórico se não fornecidos pelo modelo
            let cidade = functionArgs.cidade;
            let tipo_imovel = functionArgs.tipo_imovel;
            let tipo_transacao = functionArgs.tipo_transacao;
            let limite = functionArgs.limite || 3; // Padrão: 3 resultados
            let offset = 0; // Quantos resultados pular

            // LOG DETALHADO DO HISTÓRICO PARA DEBUG
            console.log(`📚 [FUNCTION_CALL] ========== DEBUG HISTÓRICO ==========`);
            console.log(`📚 [FUNCTION_CALL] Mensagem ATUAL: "${context.message}"`);
            console.log(`📚 [FUNCTION_CALL] Histórico existe: ${!!context.conversationHistory}`);
            console.log(`📚 [FUNCTION_CALL] Histórico length: ${context.conversationHistory?.length || 0}`);
            if (context.conversationHistory && context.conversationHistory.length > 0) {
              console.log(`📚 [FUNCTION_CALL] Histórico completo:`);
              context.conversationHistory.forEach((m, idx) => {
                console.log(`   [${idx}] ${m.role}: "${m.content.substring(0, 100)}${m.content.length > 100 ? '...' : ''}"`);
              });
            } else {
              console.log(`⚠️ [FUNCTION_CALL] ATENÇÃO: Histórico está VAZIO! A extração de parâmetros depende apenas da mensagem atual.`);
            }
            console.log(`📚 [FUNCTION_CALL] ====================================`);

            // Percorrer histórico de trás para frente (mensagens mais recentes primeiro)
            // IMPORTANTE: Incluir a mensagem ATUAL também para extração de parâmetros
            const conversationText = (context.conversationHistory
              ?.slice()
              .reverse()
              .map(m => m.content.toLowerCase())
              .join(' ') || '') + ' ' + context.message.toLowerCase();

            // Detectar se o usuário está pedindo "mais" resultados
            const currentMessage = context.message.toLowerCase();
            const pedindoMais = /\b(mais|mostre mais|quero ver mais|tem mais|próximos|proximos)\b/.test(currentMessage);

            if (pedindoMais) {
              console.log(`🔄 [FUNCTION_CALL] Usuário pediu MAIS resultados!`);
              // Contar quantas vezes a função foi chamada nesta conversa
              const functionCallsCount = context.conversationHistory?.filter(m =>
                m.role === 'assistant' && m.content.includes('Encontrei')
              ).length || 0;

              offset = functionCallsCount * 3; // Pular os já mostrados
              console.log(`📊 [FUNCTION_CALL] Offset calculado: ${offset} (chamadas anteriores: ${functionCallsCount})`);
            }

            // SEMPRE tentar extrair parâmetros do histórico + mensagem atual (fallback robusto)
            console.log(`🔍 [FUNCTION_CALL] Verificando parâmetros...`);
            console.log(`🔍 [FUNCTION_CALL] cidade do OpenAI: ${cidade || 'NÃO FORNECIDO'}`);
            console.log(`🔍 [FUNCTION_CALL] tipo_imovel do OpenAI: ${tipo_imovel || 'NÃO FORNECIDO'}`);
            console.log(`🔍 [FUNCTION_CALL] tipo_transacao do OpenAI: ${tipo_transacao || 'NÃO FORNECIDO'}`);
            console.log(`🔍 [FUNCTION_CALL] conversationText (histórico + atual): "${conversationText.substring(0, 200)}..."`);

            // Mapas de variações - ORDENADOS POR TAMANHO (maior primeiro para evitar match parcial)
            // Exemplo: "apartamento" deve ser buscado antes de "ap" para não encontrar "ap" dentro de "apartamento"
            const tiposImovelOrdenados: Array<[string, string]> = [
              ['apartamento', 'apartamento'],
              ['chácara', 'chácara'],
              ['chacara', 'chácara'],
              ['sobrado', 'sobrado'],
              ['terreno', 'terreno'],
              ['apto', 'apartamento'],
              ['casa', 'casa'],
              ['sala', 'sala'],
              ['ap', 'apartamento'],  // "ap" por último pois é substring de "apartamento"
            ];

            // Mapa para lookup rápido (usado na normalização)
            const tiposImovel: Record<string, string> = {
              'apartamento': 'apartamento',
              'ap': 'apartamento',
              'apto': 'apartamento',
              'casa': 'casa',
              'sobrado': 'sobrado',
              'sala': 'sala',
              'terreno': 'terreno',
              'chácara': 'chácara',
              'chacara': 'chácara'
            };

            const tiposTransacao: Record<string, string> = {
              'alugar': 'aluguel',
              'aluguel': 'aluguel',
              'locação': 'aluguel',
              'locacao': 'aluguel',
              'venda': 'venda',
              'vender': 'venda',
              'comprar': 'venda'
            };

            // Buscar cidade no histórico se não fornecida
            if (!cidade) {
              console.log(`🔍 [FUNCTION_CALL] Cidade NÃO foi fornecida pelo OpenAI, tentando extrair...`);
              // Lista expandida de cidades (mesma usada na detecção de busca)
              const cidades = [
                'joaçaba', 'joacaba', 'campinas', 'são paulo', 'sao paulo', 'curitiba',
                'florianópolis', 'florianopolis', 'joinville', 'blumenau', 'chapecó', 'chapeco', 'lages',
                'criciúma', 'criciuma', 'itajaí', 'itajai', 'jaraguá', 'jaragua', 'balneário', 'balneario',
                'herval', "herval d'oeste", 'herval do oeste', 'catanduvas', 'ibicaré', 'ibicare',
                'treze tílias', 'treze tilias', 'água doce', 'agua doce', 'lacerdópolis', 'lacerdopolis',
                'ouro', 'capinzal', 'erval velho', 'vargem bonita', 'tangará', 'tangara',
                'piratuba', 'ipira', 'peritiba', 'presidente castelo branco', 'jaborá', 'jabora',
                'concórdia', 'concordia', 'videira', 'fraiburgo', 'caçador', 'cacador'
              ];
              for (const c of cidades) {
                if (conversationText.includes(c)) {
                  // Capitalizar corretamente (primeira letra maiúscula de cada palavra)
                  cidade = c.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                  console.log(`✅ [FUNCTION_CALL] Cidade extraída do histórico: ${cidade}`);
                  break;
                }
              }
            } else {
              console.log(`✅ [FUNCTION_CALL] Cidade fornecida pelo OpenAI: ${cidade}`);
            }

            // Buscar tipo de imóvel no histórico se não fornecido
            if (!tipo_imovel) {
              console.log(`⚠️ [FUNCTION_CALL] CRÍTICO: tipo_imovel NÃO foi fornecido pelo OpenAI!`);
              console.log(`🔍 [FUNCTION_CALL] Tentando extrair tipo_imovel do histórico...`);
              console.log(`🔍 [FUNCTION_CALL] Histórico disponível: ${context.conversationHistory?.length || 0} mensagens`);

              // Usar array ordenado (palavras maiores primeiro) com regex word boundary
              for (const [variacao, tipo] of tiposImovelOrdenados) {
                // Usar regex com word boundary para match exato da palavra
                // \b não funciona bem com acentos, então usar alternativa
                const regex = new RegExp(`(^|\\s|[^a-záàâãéèêíìîóòôõúùûç])${variacao}($|\\s|[^a-záàâãéèêíìîóòôõúùûç])`, 'i');
                if (regex.test(conversationText)) {
                  tipo_imovel = tipo;
                  console.log(`✅ [FUNCTION_CALL] Tipo de imóvel extraído do histórico: ${tipo_imovel} (encontrou: "${variacao}")`);
                  break;
                }
              }

              if (!tipo_imovel) {
                console.log(`❌ [FUNCTION_CALL] FALHA: Não foi possível extrair tipo_imovel do histórico!`);
                console.log(`❌ [FUNCTION_CALL] conversationText completo: "${conversationText}"`);
                console.log(`❌ [FUNCTION_CALL] A busca retornará TODOS os tipos de imóveis!`);
              }
            } else {
              console.log(`✅ [FUNCTION_CALL] Tipo de imóvel fornecido pelo OpenAI: ${tipo_imovel}`);
            }

            // Buscar tipo de transação no histórico se não fornecido
            if (!tipo_transacao) {
              console.log(`🔍 [FUNCTION_CALL] Tipo de transação NÃO foi fornecido, tentando extrair...`);
              for (const [variacao, tipo] of Object.entries(tiposTransacao)) {
                if (conversationText.includes(variacao)) {
                  tipo_transacao = tipo;
                  console.log(`✅ [FUNCTION_CALL] Tipo de transação extraído do histórico: ${tipo_transacao}`);
                  break;
                }
              }
            } else {
              console.log(`✅ [FUNCTION_CALL] Tipo de transação fornecido pelo OpenAI: ${tipo_transacao}`);
            }

            // NORMALIZAR tipo_imovel SEMPRE (não apenas quando não fornecido)
            if (tipo_imovel) {
              const tiposImovelMap: Record<string, string> = {
                'apartamento': 'apartamento',
                'ap': 'apartamento',
                'apto': 'apartamento',
                'casa': 'casa',
                'sobrado': 'sobrado',
                'sala': 'sala',
                'terreno': 'terreno',
                'chácara': 'chácara',
                'chacara': 'chácara'
              };

              const tipoNormalizado = tiposImovelMap[tipo_imovel.toLowerCase()];
              if (tipoNormalizado) {
                console.log(`🔄 [FUNCTION_CALL] Normalizando tipo_imovel: "${tipo_imovel}" → "${tipoNormalizado}"`);
                tipo_imovel = tipoNormalizado;
              }
            }

            console.log(`🔎 [FUNCTION_CALL] Parâmetros finais - Cidade: ${cidade || 'não especificada'}, Tipo: ${tipo_imovel || 'não especificado'}, Transação: ${tipo_transacao || 'não especificada'}, Limite: ${limite}, Offset: ${offset}`);

            // LOGS DETALHADOS DOS FILTROS
            console.log('🔍 [FUNCTION_CALL] ========== FILTROS ENVIADOS PARA searchProperties ==========');
            console.log(`🔍 [FUNCTION_CALL] functionArgs RAW:`, JSON.stringify(functionArgs, null, 2));
            console.log(`🔍 [FUNCTION_CALL] tipo_imovel ANTES de enviar: "${tipo_imovel}" (type: ${typeof tipo_imovel})`);
            console.log(`🔍 [FUNCTION_CALL] cidade ANTES de enviar: "${cidade}" (type: ${typeof cidade})`);
            console.log(`🔍 [FUNCTION_CALL] tipo_transacao ANTES de enviar: "${tipo_transacao}" (type: ${typeof tipo_transacao})`);

            const searchFilters = {
              city: cidade,
              transactionType: tipo_transacao === 'aluguel' ? 'locacao' : tipo_transacao,
              propertyType: tipo_imovel
            };

            console.log(`🔍 [FUNCTION_CALL] Objeto searchFilters completo:`, JSON.stringify(searchFilters, null, 2));
            console.log('🔍 [FUNCTION_CALL] ================================================================');

            // Buscar imóveis usando o companyId da instância
            let properties = await storage.searchProperties(instanceForSearch.companyId, searchFilters);

            const totalEncontrados = properties.length;

            console.log(`📊 [FUNCTION_CALL] ANTES DO SLICE - Total encontrados: ${totalEncontrados}, Offset: ${offset}, Limite: ${limite}`);

            // Aplicar offset e limite (paginação de 3 em 3)
            properties = properties.slice(offset, offset + limite);

            console.log(`🏠 [FUNCTION_CALL] DEPOIS DO SLICE - Retornando ${properties.length} imóveis (de ${offset} até ${offset + limite})`);
            console.log(`📋 [FUNCTION_CALL] Códigos dos imóveis que serão retornados: ${properties.map(p => p.code).join(', ')}`);

            // Log detalhado das imagens
            properties.forEach((p, idx) => {
              console.log(`📸 [FUNCTION_CALL] Imóvel ${idx + 1} (${p.code}): ${p.images?.length || 0} imagens`);
              if (p.images && p.images.length > 0) {
                console.log(`   URLs: ${p.images.join(', ')}`);
              }
            });

            // Coletar todas as imagens dos imóveis encontrados
            const allPropertyImages: string[] = [];
            properties.forEach(p => {
              if (p.images && Array.isArray(p.images)) {
                allPropertyImages.push(...p.images);
              }
            });
            console.log(`📸 [FUNCTION_CALL] Total de imagens coletadas: ${allPropertyImages.length}`);

            // Buscar comodidades da empresa para mapear IDs para nomes
            let amenitiesMap: Record<string, string> = {};
            try {
              const companyAmenities = await storage.getAmenitiesByCompany(instanceForSearch.companyId);
              amenitiesMap = companyAmenities.reduce((acc, a) => {
                acc[a.id] = a.name;
                return acc;
              }, {} as Record<string, string>);
              console.log(`✨ [FUNCTION_CALL] ${Object.keys(amenitiesMap).length} comodidades carregadas`);
            } catch (e) {
              console.log(`⚠️ [FUNCTION_CALL] Erro ao carregar comodidades: ${e}`);
            }

            // Preparar dados estruturados dos imóveis para envio sequencial
            const structuredProperties: PropertyData[] = properties.map(p => {
              // Formatar valor do imóvel
              const valorFormatado = p.price
                ? Number(p.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                : 'Valor sob consulta';
              const tipoTransacao = p.transactionType === 'locacao' ? 'Aluguel' : 'Venda';

              // Mapear IDs das comodidades para nomes
              let comodidadesTexto = '';
              if (p.amenities && Array.isArray(p.amenities) && p.amenities.length > 0) {
                const nomesComodidades = p.amenities
                  .map((id: string) => amenitiesMap[id])
                  .filter((nome: string | undefined) => nome) // Filtrar undefined
                  .join(', ');
                if (nomesComodidades) {
                  comodidadesTexto = `\n✨ ${nomesComodidades}`;
                }
              }

              return {
                code: p.code || 'SEM-CÓDIGO',
                name: p.name || 'Imóvel sem nome',
                endereco: `${p.street}, ${p.number} - ${p.neighborhood || ''}, ${p.city || ''} - ${p.state || ''}`,
                description: `Código: ${p.code || 'N/A'}\n${p.name}\n📍 ${p.street}, ${p.number} - ${p.neighborhood || ''}, ${p.city || ''} - ${p.state || ''}\n🛏️ ${p.bedrooms} quartos | 🚿 ${p.bathrooms} banheiros | 🚗 ${p.parkingSpaces} vagas\n📐 ${p.privateArea}m²\n💰 ${tipoTransacao}: ${valorFormatado}${comodidadesTexto}\n${p.description ? '\n' + p.description : ''}`,
                images: (p.images || []).slice(0, 5) // Limitar a 5 imagens por imóvel
              };
            });

            // Formatar resultado SIMPLIFICADO para o modelo
            // NÃO enviar detalhes dos imóveis, apenas estatísticas
            // Isso evita que o modelo liste os imóveis no texto da resposta
            const totalRestante = totalEncontrados - (offset + properties.length);

            // Se o usuário pediu mais mas não há mais imóveis
            if (properties.length === 0 && offset > 0) {
              console.log(`🔄 [FUNCTION_CALL] Não há mais imóveis para mostrar (offset: ${offset})`);
              return {
                text: `Esses são todos os imóveis disponíveis! 🏠\n\nQual deles você mais gostou? Me diga o código (ex: A1001) que eu agendo uma visita sem compromisso para você conhecer de perto! 📅`
              };
            }

            // Se não encontrou nenhum imóvel
            if (properties.length === 0 && offset === 0) {
              console.log(`❌ [FUNCTION_CALL] Nenhum imóvel encontrado com os filtros aplicados`);
              return {
                text: `Não encontrei imóveis com essas características no momento. 😔\n\nPosso ajudar você a buscar de outra forma? Tente mudar a cidade, o tipo de imóvel ou o tipo de transação.`
              };
            }

            const mensagemInicial = offset === 0
              ? `Encontrei ${totalEncontrados} imóveis. Mostrando os primeiros ${properties.length}.`
              : `Mostrando mais ${properties.length} imóveis.`;

            // Incluir códigos dos imóveis mostrados para referência
            const codigosImoveis = properties.map(p => p.code).join(', ');

            // Mensagem diferente se não tem mais resultados
            const instrucaoAgente = totalRestante > 0
              ? `IMPORTANTE: O sistema enviará os imóveis automaticamente. Responda apenas com uma introdução curta como "Mais opções para você! Veja:"`
              : `IMPORTANTE: Esses são TODOS os imóveis disponíveis. Após os imóveis serem exibidos, pergunte ao usuário qual código ele mais gostou para agendar uma visita.`;

            const functionResult = {
              total: totalEncontrados,
              total_retornado: properties.length,
              offset: offset,
              limite_aplicado: limite,
              tem_mais_resultados: totalRestante > 0,
              total_restante: totalRestante,
              codigos_mostrados: codigosImoveis,
              mensagem: `${mensagemInicial}${totalRestante > 0 ? ` Ainda há mais ${totalRestante} imóveis disponíveis. O usuário pode pedir "mais" para ver os próximos.` : ' Esses são todos os imóveis disponíveis.'} O sistema enviará cada imóvel automaticamente com suas fotos.`,
              instrucao_agente: instrucaoAgente
            };

            // Adicionar a resposta da função ao contexto e fazer nova chamada
            // IMPORTANTE: Manter TODO o histórico da conversa para preservar memória
            messages.push(responseMessage);
            messages.push({
              role: "tool" as const,
              tool_call_id: toolCall.id,
              content: JSON.stringify(functionResult)
            });

            // Adicionar instrução para resposta CURTA (a pergunta de agendamento será enviada automaticamente após os imóveis)
            messages.push({
              role: "system" as const,
              content: `INSTRUÇÃO: Os imóveis com códigos [${codigosImoveis}] estão sendo enviados ao usuário com fotos. Sua resposta deve ser MUITO CURTA, apenas uma breve introdução (1-2 frases). NÃO inclua pergunta sobre agendamento - ela será enviada automaticamente após os imóveis. Exemplo: "Encontrei ótimas opções para você! Veja:"`
            });

            console.log(`📚 [FUNCTION_CALL] Fazendo chamada final COM histórico completo (${messages.length} mensagens)`);
            console.log(`📚 [FUNCTION_CALL] Composição: 1 system + ${context.conversationHistory?.length || 0} histórico + mensagem atual + tool_call + tool_result + instrução agendamento`);

            // Fazer nova chamada para o modelo processar o resultado
            // Mantendo TODO o histórico para que o agente não perca memória
            // max_tokens baixo para forçar resposta curta (apenas introdução)
            // IMPORTANTE: Passar as tools para que o modelo possa chamar agendar_visita se necessário
            const finalResponse = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: messages, // Inclui: system + histórico + mensagem atual + tool_call + tool_result + instrução
              max_tokens: 100, // Baixo para resposta curta (só introdução)
              temperature: 0.5,
              tools: tools, // Manter tools disponíveis para possível agendamento
              tool_choice: "auto" // Deixar o modelo decidir se precisa chamar alguma tool
            });

            console.log(`✅ [FUNCTION_CALL] Resposta final gerada COM memória preservada`);
            console.log(`📦 [FUNCTION_CALL] Retornando ${structuredProperties.length} imóveis estruturados`);
            console.log(`📦 [FUNCTION_CALL] Há mais imóveis disponíveis: ${totalRestante > 0}`);

            return {
              text: finalResponse.choices[0].message.content || "Encontrei os imóveis mas não consegui formatá-los.",
              propertyImages: allPropertyImages.length > 0 ? allPropertyImages : undefined, // deprecated
              properties: structuredProperties.length > 0 ? structuredProperties : undefined,
              hasMoreProperties: totalRestante > 0
            };

          } catch (error) {
            console.error(`❌ [FUNCTION_CALL] Erro ao executar busca_imoveis:`, error);
            return { text: "Desculpe, ocorreu um erro ao buscar os imóveis. Tente novamente." };
          }
        } else if (functionName === "agendar_visita") {
          // ========== FUNÇÃO: AGENDAR VISITA ==========
          try {
            console.log(`📅 [AGENDAR_VISITA] Iniciando agendamento de visita...`);
            console.log(`📅 [AGENDAR_VISITA] Argumentos recebidos:`, JSON.stringify(functionArgs, null, 2));

            // Buscar instância para obter companyId
            let instanceForAppointment = await storage.getWhatsappInstanceByEvolutionId(context.instanceId);
            if (!instanceForAppointment && (context as any).databaseInstanceId) {
              instanceForAppointment = await storage.getWhatsappInstance((context as any).databaseInstanceId);
            }

            if (!instanceForAppointment?.companyId) {
              throw new Error('Instância ou companyId não encontrado');
            }

            console.log(`🏢 [AGENDAR_VISITA] CompanyId: ${instanceForAppointment.companyId}`);

            // Extrair dados do agendamento
            const nomeCliente = functionArgs.nome_cliente || context.pushName || 'Cliente WhatsApp';
            const telefoneCliente = functionArgs.telefone_cliente || context.phone;
            const imovelInteresse = functionArgs.imovel_interesse || 'Imóvel não especificado';
            const dataVisita = functionArgs.data_visita || 'Data a confirmar';
            const observacoes = functionArgs.observacoes || null;

            console.log(`📅 [AGENDAR_VISITA] Dados do agendamento:`);
            console.log(`   Nome: ${nomeCliente}`);
            console.log(`   Telefone: ${telefoneCliente}`);
            console.log(`   Imóvel: ${imovelInteresse}`);
            console.log(`   Data da visita: ${dataVisita}`);
            console.log(`   Observações: ${observacoes || 'Nenhuma'}`);

            // Buscar corretores da empresa para rodízio
            const brokers = await storage.getBrokersByCompany(instanceForAppointment.companyId);
            let brokerId: string | null = null;
            let brokerName: string | null = null;

            if (brokers.length > 0) {
              // ========== SISTEMA DE RODÍZIO DE CORRETORES ==========
              // 1. Primeiro agendamento do dia: aleatório
              // 2. Próximos agendamentos: próximo corretor na lista (circular)

              console.log(`🔄 [RODÍZIO] Iniciando seleção de corretor em rodízio...`);
              console.log(`🔄 [RODÍZIO] Total de corretores disponíveis: ${brokers.length}`);

              // Ordenar corretores por ID para garantir ordem consistente
              const sortedBrokers = [...brokers].sort((a, b) => a.id.localeCompare(b.id));

              // Buscar último agendamento do dia que tem corretor
              const lastAppointment = await storage.getLastAppointmentOfDayWithBroker(instanceForAppointment.companyId);

              if (!lastAppointment || !lastAppointment.brokerId) {
                // Primeiro agendamento do dia - selecionar aleatoriamente
                const randomIndex = Math.floor(Math.random() * sortedBrokers.length);
                brokerId = sortedBrokers[randomIndex].id;
                brokerName = sortedBrokers[randomIndex].name;
                console.log(`🎲 [RODÍZIO] Primeiro agendamento do dia - corretor aleatório: ${brokerName}`);
              } else {
                // Já houve agendamento hoje - pegar próximo corretor na lista (circular)
                const lastBrokerIndex = sortedBrokers.findIndex(b => b.id === lastAppointment.brokerId);

                if (lastBrokerIndex === -1) {
                  // Corretor do último agendamento não existe mais, começar do início
                  brokerId = sortedBrokers[0].id;
                  brokerName = sortedBrokers[0].name;
                  console.log(`⚠️ [RODÍZIO] Corretor anterior não encontrado - reiniciando: ${brokerName}`);
                } else {
                  // Próximo corretor (circular - volta ao início se chegar no fim)
                  const nextIndex = (lastBrokerIndex + 1) % sortedBrokers.length;
                  brokerId = sortedBrokers[nextIndex].id;
                  brokerName = sortedBrokers[nextIndex].name;
                  console.log(`🔄 [RODÍZIO] Próximo corretor na lista (${lastBrokerIndex + 1} → ${nextIndex + 1}): ${brokerName}`);
                }
              }

              console.log(`👤 [AGENDAR_VISITA] Corretor atribuído por rodízio: ${brokerName} (ID: ${brokerId})`);
            } else {
              console.log(`⚠️ [AGENDAR_VISITA] Nenhum corretor cadastrado - agendamento sem corretor`);
            }

            // Buscar conversationId se disponível
            let conversationId: string | null = null;
            try {
              const dbInstanceId = (context as any).databaseInstanceId || context.instanceId;
              const conversations = await storage.getConversationsByInstance(dbInstanceId);
              const conversation = conversations.find(c => c.contactPhone === context.phone);
              if (conversation) {
                conversationId = conversation.id;
              }
            } catch (e) {
              console.log(`⚠️ [AGENDAR_VISITA] Não foi possível obter conversationId`);
            }

            // Criar o agendamento com a data da visita nas observações
            const notesComData = dataVisita !== 'Data a confirmar'
              ? `Visita agendada para: ${dataVisita}${observacoes ? ` | ${observacoes}` : ''}`
              : observacoes;

            // Parsear a data da visita para salvar no scheduledDate
            // Formato esperado: "Segunda-feira dia 05/01/2026 às 9h" ou "Sexta dia 02/01/2026 às 16h"
            let scheduledDateParsed: Date | null = null;
            if (dataVisita && dataVisita !== 'Data a confirmar') {
              try {
                // Extrair dia/mês/ano e hora do texto
                const regexData = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
                const regexHora = /(\d{1,2})h/;

                const matchData = dataVisita.match(regexData);
                const matchHora = dataVisita.match(regexHora);

                if (matchData) {
                  const dia = parseInt(matchData[1]);
                  const mes = parseInt(matchData[2]) - 1; // Mês em JS é 0-indexed
                  const ano = parseInt(matchData[3]);
                  const hora = matchHora ? parseInt(matchHora[1]) : 9; // Default 9h

                  scheduledDateParsed = new Date(ano, mes, dia, hora, 0, 0);
                  console.log(`📅 [AGENDAR_VISITA] Data parseada: ${scheduledDateParsed.toISOString()}`);
                }
              } catch (parseError) {
                console.log(`⚠️ [AGENDAR_VISITA] Erro ao parsear data: ${parseError}`);
              }
            }

            const newAppointment = await storage.createAppointment({
              companyId: instanceForAppointment.companyId,
              brokerId: brokerId,
              propertyId: null, // Poderia buscar pelo código do imóvel
              clientName: nomeCliente,
              clientPhone: telefoneCliente,
              propertyInterest: imovelInteresse,
              scheduledDate: scheduledDateParsed,
              status: 'confirmado', // Status confirmado pois o usuário escolheu o horário
              notes: notesComData,
              source: 'whatsapp',
              conversationId: conversationId
            });

            console.log(`✅ [AGENDAR_VISITA] Agendamento criado com sucesso! ID: ${newAppointment.id}`);

            // ========== NOTIFICAÇÃO AO CORRETOR VIA WHATSAPP ==========
            console.log(`📲 [NOTIFICAÇÃO] Verificando se deve enviar notificação...`);
            console.log(`📲 [NOTIFICAÇÃO] brokerId: ${brokerId}`);
            console.log(`📲 [NOTIFICAÇÃO] brokerName: ${brokerName}`);

            if (brokerId) {
              try {
                console.log(`📲 [NOTIFICAÇÃO] Iniciando notificação ao corretor...`);

                // Buscar dados do corretor
                const broker = await storage.getBroker(brokerId);
                console.log(`📲 [NOTIFICAÇÃO] Corretor encontrado no DB:`, broker ? `${broker.name} (WhatsApp: ${broker.whatsapp || 'NÃO CADASTRADO'})` : 'NÃO ENCONTRADO');

                if (broker?.whatsapp) {
                  console.log(`📲 [NOTIFICAÇÃO] Corretor: ${broker.name}, WhatsApp: ${broker.whatsapp}`);

                  // Buscar dados do imóvel pelo código (extrair código do texto de interesse)
                  let propertyInfo = {
                    code: imovelInteresse,
                    transactionType: '-',
                    propertyType: '-',
                    city: '-'
                  };

                  // Tentar extrair código do imóvel (formato: A1001, IMV001, etc.)
                  const codigoMatch = imovelInteresse.match(/[A-Za-z]*\d+/);
                  if (codigoMatch) {
                    const codigoImovel = codigoMatch[0].toUpperCase();
                    console.log(`🔍 [NOTIFICAÇÃO] Buscando imóvel pelo código: ${codigoImovel}`);

                    const property = await storage.getPropertyByCode(codigoImovel, instanceForAppointment.companyId);

                    if (property) {
                      console.log(`✅ [NOTIFICAÇÃO] Imóvel encontrado: ${property.name}`);
                      propertyInfo = {
                        code: property.code,
                        transactionType: property.transactionType === 'locacao' ? 'Locação' : 'Venda',
                        propertyType: property.propertyType || '-',
                        city: property.city || '-'
                      };
                    } else {
                      console.log(`⚠️ [NOTIFICAÇÃO] Imóvel não encontrado pelo código`);
                    }
                  }

                  // Formatar número do cliente para link do WhatsApp (com código do país 55)
                  let clientPhoneClean = telefoneCliente.replace(/\D/g, '');
                  let whatsappLink = '';

                  // Validar se é um número de telefone válido (não LID do WhatsApp)
                  // Números brasileiros válidos: 10-11 dígitos (sem 55) ou 12-13 dígitos (com 55)
                  const isValidBrazilianPhone = (
                    (clientPhoneClean.length >= 10 && clientPhoneClean.length <= 11) || // Sem código do país
                    (clientPhoneClean.length >= 12 && clientPhoneClean.length <= 13 && clientPhoneClean.startsWith('55')) // Com código do país
                  );

                  if (isValidBrazilianPhone) {
                    // Adicionar código do país 55 se não tiver
                    if (!clientPhoneClean.startsWith('55')) {
                      clientPhoneClean = '55' + clientPhoneClean;
                    }
                    whatsappLink = `https://wa.me/${clientPhoneClean}`;
                  } else {
                    // Número inválido (provavelmente LID do WhatsApp) - não gerar link
                    console.log(`⚠️ [NOTIFICAÇÃO] Número de telefone inválido para link WhatsApp: ${clientPhoneClean} (${clientPhoneClean.length} dígitos)`);
                    whatsappLink = `(Número não disponível para link direto)`;
                  }

                  // Montar mensagem para o corretor
                  const mensagemCorretor = `🏠 *NOVO AGENDAMENTO DE VISITA*

👤 *Cliente:* ${nomeCliente}
📱 *Telefone:* ${telefoneCliente}

🏢 *Imóvel:* ${propertyInfo.code}
📋 *Tipo:* ${propertyInfo.propertyType}
💼 *Transação:* ${propertyInfo.transactionType}
📍 *Cidade:* ${propertyInfo.city}

📅 *Data da visita:* ${dataVisita}

👉 *Clique para falar com o cliente:*
${whatsappLink}`;

                  // Buscar configuração da Evolution API
                  const evolutionConfig = await storage.getEvolutionApiConfiguration();

                  if (evolutionConfig?.evolutionURL && evolutionConfig?.evolutionToken) {
                    const evolutionApi = new EvolutionApiService({
                      baseURL: evolutionConfig.evolutionURL,
                      token: evolutionConfig.evolutionToken
                    });

                    // Formatar número do corretor
                    const brokerPhoneClean = broker.whatsapp.replace(/\D/g, '');

                    // Usar a mesma instância do WhatsApp para enviar
                    const instanceName = instanceForAppointment.evolutionId || instanceForAppointment.name;

                    console.log(`📤 [NOTIFICAÇÃO] Enviando mensagem para corretor ${broker.name} (${brokerPhoneClean}) via instância ${instanceName}`);

                    await evolutionApi.sendMessage(instanceName, brokerPhoneClean, mensagemCorretor);

                    console.log(`✅ [NOTIFICAÇÃO] Mensagem enviada com sucesso ao corretor!`);
                  } else {
                    console.log(`⚠️ [NOTIFICAÇÃO] Evolution API não configurada - notificação não enviada`);
                  }
                } else {
                  console.log(`⚠️ [NOTIFICAÇÃO] Corretor não tem WhatsApp cadastrado`);
                }
              } catch (notificationError) {
                console.error(`❌ [NOTIFICAÇÃO] Erro ao enviar notificação ao corretor:`, notificationError);
                // Não interromper o fluxo se a notificação falhar
              }
            } else {
              console.log(`⚠️ [NOTIFICAÇÃO] Nenhum corretor atribuído ao agendamento - notificação não enviada`);
            }

            // Preparar resultado para o modelo
            const appointmentResult = {
              sucesso: true,
              agendamento_id: newAppointment.id,
              nome_cliente: nomeCliente,
              telefone: telefoneCliente,
              imovel: imovelInteresse,
              data_visita: dataVisita,
              corretor: brokerName || 'A definir',
              status: 'confirmado',
              mensagem: brokerName
                ? `Perfeito! Sua visita ao imóvel ${imovelInteresse} está agendada para ${dataVisita}. O corretor ${brokerName} estará aguardando você no local. Até lá!`
                : `Perfeito! Sua visita ao imóvel ${imovelInteresse} está agendada para ${dataVisita}. Nossa equipe estará aguardando você no local. Até lá!`
            };

            // Adicionar resposta da função e fazer nova chamada
            messages.push(responseMessage);
            messages.push({
              role: "tool" as const,
              tool_call_id: toolCall.id,
              content: JSON.stringify(appointmentResult)
            });

            const finalResponse = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: messages,
              max_tokens: 200,
              temperature: 0.5,
            });

            console.log(`✅ [AGENDAR_VISITA] Resposta final gerada`);

            return {
              text: finalResponse.choices[0].message.content || appointmentResult.mensagem
            };

          } catch (error) {
            console.error(`❌ [AGENDAR_VISITA] Erro ao criar agendamento:`, error);
            return { text: "Desculpe, ocorreu um erro ao criar o agendamento. Por favor, tente novamente ou entre em contato diretamente conosco." };
          }
        }
      }

      console.log(`✅ [OPENAI] Response length: ${responseMessage.content?.length || 0}`);
      return { text: responseMessage.content || "Desculpe, não consegui gerar uma resposta." };

    } catch (error) {
      console.error("❌ Error generating AI response - DETAILED:", {
        error: error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace',
        name: error instanceof Error ? error.name : 'Unknown error type'
      });
      
      // Log específico se for erro da OpenAI
      if (error instanceof Error && error.message.includes('API')) {
        console.error("🔑 OpenAI API Error detected - checking configuration...");
        console.error("🔑 Error details:", error.message);
      }

      return { text: "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em alguns instantes." };
    }
  }

  async saveConversation(evolutionInstanceIdOrName: string, phone: string, userMessage: string, aiResponse: string, agentId: string, messageData?: {
    messageType?: string;
    mediaUrl?: string;
    mediaBase64?: string;
    caption?: string;
    pushName?: string; // Nome do contato no WhatsApp
  }) {
    try {
      const storage = getStorage();

      console.log(`💾 [SAVE] ========================================`);
      console.log(`💾 [SAVE] saveConversation chamado`);
      console.log(`💾 [SAVE] instanceIdOrName: "${evolutionInstanceIdOrName}"`);
      console.log(`💾 [SAVE] phone: "${phone}"`);
      console.log(`💾 [SAVE] userMessage: "${userMessage.substring(0, 50)}..."`);
      console.log(`💾 [SAVE] messageData:`, JSON.stringify(messageData, null, 2));
      console.log(`💾 [SAVE] pushName recebido: "${messageData?.pushName || 'NULL/UNDEFINED'}"`);

      // PRIMEIRO: Encontrar a instância do nosso banco usando o evolutionInstanceId OU nome
      const dbInstanceId = await this.findDatabaseInstanceId(evolutionInstanceIdOrName);
      if (!dbInstanceId) {
        console.log(`💾 Erro: Instância do banco não encontrada para salvar conversa. IdOrName: ${evolutionInstanceIdOrName}`);
        return null;
      }

      console.log(`💾 Salvando conversa na instância: ${dbInstanceId} (input: ${evolutionInstanceIdOrName})`);
      
      // Buscar conversa existente usando o ID correto do banco
      const conversations = await storage.getConversationsByInstance(dbInstanceId);
      let conversation = conversations.find(c => c.contactPhone === phone);
      
      let isNewConversation = false;
      if (!conversation) {
        console.log(`💾 ========== NOVA CONVERSA DETECTADA ==========`);
        console.log(`💾 Criando nova conversa para ${phone}`);
        console.log(`💾 Esta é a PRIMEIRA mensagem deste usuário!`);
        console.log(`👤 [PUSHNAME] PushName recebido: ${messageData?.pushName || 'Não fornecido'}`);
        isNewConversation = true;

        // Criar conversa com pushName se disponível
        const conversationData = {
          whatsappInstanceId: dbInstanceId,
          contactPhone: phone,
          contactName: messageData?.pushName || null,
          lastMessage: userMessage
        };

        console.log(`💾 [CREATE] Dados da conversa a serem criados:`, JSON.stringify(conversationData, null, 2));

        conversation = await storage.createConversation(conversationData);

        console.log(`✅ [CREATE] Conversa criada com sucesso!`);
        console.log(`✅ [CREATE] ID: ${conversation.id}`);
        console.log(`✅ [CREATE] contactName salvo: "${conversation.contactName}"`);
        console.log(`✅ [CREATE] contactPhone: ${conversation.contactPhone}`);

        // 🎯 FUNCIONALIDADE: Criar lead E customer automaticamente quando alguém enviar a PRIMEIRA mensagem
        console.log(`🚀 [PRIMEIRA MENSAGEM] Detectada primeira mensagem de ${phone}, criando lead e customer automaticamente...`);
        console.log(`🔍 [DEBUG] Parâmetros para createLeadAndCustomerFromNewMessage:`, {
          whatsappInstanceId: dbInstanceId,
          phone: phone,
          conversationId: conversation.id,
          pushName: messageData?.pushName
        });
        try {
          await this.createLeadAndCustomerFromNewMessage(dbInstanceId, phone, conversation.id, messageData?.pushName);
          console.log(`✅ [DEBUG] createLeadAndCustomerFromNewMessage executada com sucesso`);
        } catch (error) {
          console.error(`❌ [DEBUG] Erro ao executar createLeadAndCustomerFromNewMessage:`, error);
        }
      } else {
        console.log(`💾 Usando conversa existente: ${conversation.id}`);

        // 👤 ATUALIZAR contactName se pushName foi fornecido e é diferente do atual
        if (messageData?.pushName && conversation.contactName !== messageData.pushName) {
          console.log(`👤 [PUSHNAME] Atualizando contactName de "${conversation.contactName}" para "${messageData.pushName}"`);
          try {
            await storage.updateConversation(conversation.id, {
              contactName: messageData.pushName
            });
            console.log(`✅ [PUSHNAME] ContactName atualizado com sucesso!`);
          } catch (error) {
            console.error(`❌ [PUSHNAME] Erro ao atualizar contactName:`, error);
          }
        } else if (messageData?.pushName) {
          console.log(`👤 [PUSHNAME] ContactName já está correto: "${conversation.contactName}"`);
        } else {
          console.log(`👤 [PUSHNAME] Nenhum pushName fornecido para atualização`);
        }

        // 🎯 Verificar e criar lead/customer se não existir (mesmo com conversa existente)
        console.log(`🔍 [LEAD+CUSTOMER] Verificando se lead/customer existe para conversa existente...`);
        try {
          await this.createLeadAndCustomerFromNewMessage(dbInstanceId, phone, conversation.id, messageData?.pushName || conversation.contactName);
        } catch (error) {
          console.error(`❌ [LEAD+CUSTOMER] Erro ao verificar/criar lead+customer:`, error);
        }
      }

      // Salvar mensagem do usuário (com dados de imagem se presente)
      const userMessageData: any = {
        conversationId: conversation.id,
        content: userMessage,
        sender: 'user',
        messageType: messageData?.messageType || 'text'
      };

      // Adicionar dados de imagem se presente
      if (messageData) {
        if (messageData.mediaUrl) userMessageData.mediaUrl = messageData.mediaUrl;
        if (messageData.mediaBase64) userMessageData.mediaBase64 = messageData.mediaBase64;
        if (messageData.caption) userMessageData.caption = messageData.caption;
      }

      await storage.createMessage(userMessageData);

      // Salvar resposta do AI
      await storage.createMessage({
        conversationId: conversation.id,
        content: aiResponse,
        sender: 'assistant',
        agentId: agentId, // Rastrear qual agente respondeu
        messageType: 'text'
      });

      // 🏠 ATUALIZAR LEAD COM CIDADE E TIPO DE IMÓVEL (se detectados na conversa)
      try {
        // Obter a instância para determinar a empresa
        const instance = await storage.getWhatsappInstance(dbInstanceId);
        if (instance?.companyId) {
          // Buscar histórico da conversa para análise completa
          const messages = await storage.getMessagesByConversation(conversation.id);
          const conversationHistory = messages
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            .slice(-20) // Últimas 20 mensagens
            .map(msg => ({
              role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
              content: msg.content
            }));

          // Chamar função para atualizar customer com interesse em imóvel
          await this.updateCustomerWithPropertyInterest(
            phone,
            instance.companyId,
            userMessage,
            conversationHistory
          );
        }
      } catch (leadUpdateError) {
        console.error(`⚠️ [SAVE] Erro ao atualizar lead (não crítico):`, leadUpdateError);
      }

      console.log(`💾 Conversa salva com sucesso: ${conversation.id}`);
      return conversation;
    } catch (error) {
      console.error("❌ Error saving conversation:", error);
      throw error;
    }
  }

  // 🎯 FUNCIONALIDADE: Criar lead E customer automaticamente quando alguém enviar a primeira mensagem
  private async createLeadAndCustomerFromNewMessage(whatsappInstanceId: string, phone: string, conversationId: string, pushName?: string) {
    try {
      console.log(`🎯 [LEAD+CUSTOMER] === INICIANDO CRIAÇÃO DE LEAD E CUSTOMER ===`);
      console.log(`📞 [LEAD+CUSTOMER] Phone: ${phone}`);
      console.log(`👤 [LEAD+CUSTOMER] PushName: ${pushName || 'N/A'}`);
      console.log(`🏢 [LEAD+CUSTOMER] WhatsApp Instance ID: ${whatsappInstanceId}`);
      console.log(`💬 [LEAD+CUSTOMER] Conversation ID: ${conversationId}`);

      const storage = getStorage();

      // Obter a instância para determinar a empresa
      const instance = await storage.getWhatsappInstance(whatsappInstanceId);
      if (!instance?.companyId) {
        console.log(`❌ [LEAD+CUSTOMER] Instância ou companyId não encontrada`);
        return;
      }

      console.log(`✅ [LEAD+CUSTOMER] Company ID: ${instance.companyId}`);

      // Verificar se já existe um lead para este telefone na empresa
      const existingLead = await storage.getLeadByPhone(phone, instance.companyId);
      if (existingLead) {
        console.log(`⚠️ [LEAD+CUSTOMER] Lead já existe! ID: ${existingLead.id}`);
      } else {
        // Criar lead na tabela leads
        console.log(`🚀 [LEAD+CUSTOMER] CRIANDO LEAD...`);
        const leadName = pushName || phone;
        console.log(`🔍 [LEAD+CUSTOMER] Dados do lead a ser criado:`, {
          companyId: instance.companyId,
          name: leadName,
          phone: phone,
          email: null,
          source: 'WhatsApp',
          status: 'new',
          notes: 'Lead criado automaticamente através da primeira mensagem do WhatsApp',
          convertedToCustomer: false,
          customerId: null
        });

        const newLead = await storage.createLead({
          companyId: instance.companyId,
          name: leadName,
          phone: phone,
          email: null,
          source: 'WhatsApp',
          status: 'new',
          notes: 'Lead criado automaticamente através da primeira mensagem do WhatsApp',
          convertedToCustomer: false,
          customerId: null
        });
        console.log(`🎉 [LEAD+CUSTOMER] LEAD CRIADO COM SUCESSO!`);
        console.log(`✅ [LEAD+CUSTOMER] Lead ID: ${newLead.id}`);
        console.log(`✅ [LEAD+CUSTOMER] Lead Nome: ${newLead.name}`);
        console.log(`✅ [LEAD+CUSTOMER] Lead Phone: ${newLead.phone}`);
      }

      // Verificar se já existe um customer com este telefone na empresa
      const existingCustomer = await storage.getCustomerByPhone(phone, instance.companyId);
      if (existingCustomer) {
        console.log(`⚠️ [LEAD+CUSTOMER] Customer já existe! ID: ${existingCustomer.id}`);
        // Atualizar conversationId se necessário
        if (existingCustomer.conversationId !== conversationId) {
          await storage.updateCustomer(existingCustomer.id, {
            conversationId: conversationId,
            lastContact: new Date().toISOString().slice(0, 19).replace('T', ' ')
          });
          console.log(`📝 [LEAD+CUSTOMER] Customer conversationId atualizado`);
        }
      } else {
        // Buscar primeiro estágio do funil global
        const funnelStages = await storage.getGlobalFunnelStages();
        const firstStage = funnelStages.find(stage => stage.order === 1) || funnelStages[0];

        if (firstStage) {
          // Criar customer na tabela customers
          console.log(`🚀 [LEAD+CUSTOMER] CRIANDO CUSTOMER...`);
          const customerName = pushName || phone;
          const newCustomer = await storage.createCustomer({
            companyId: instance.companyId,
            name: customerName,
            phone: phone,
            email: null,
            company: null,
            funnelStageId: firstStage.id,
            lastContact: new Date().toISOString().slice(0, 19).replace('T', ' '),
            notes: 'Customer criado automaticamente através da primeira mensagem do WhatsApp',
            value: null,
            source: 'WhatsApp',
            conversationId: conversationId
          });
          console.log(`🎉 [LEAD+CUSTOMER] CUSTOMER CRIADO! ID: ${newCustomer.id}, Nome: ${newCustomer.name}`);
        } else {
          console.log(`⚠️ [LEAD+CUSTOMER] Nenhum estágio do funil encontrado (global)`);
        }
      }

      console.log(`✅ [LEAD+CUSTOMER] PROCESSO CONCLUÍDO COM SUCESSO!`);

    } catch (error) {
      console.error("❌ [LEAD+CUSTOMER] ERRO ao criar lead e customer:", error);
      console.error("❌ [LEAD+CUSTOMER] Stack:", (error as Error).stack);
    }
  }

  // 🎯 FUNCIONALIDADE: Atualizar customer com cidade e tipo de imóvel extraídos da conversa
  async updateCustomerWithPropertyInterest(
    phone: string,
    companyId: string,
    message: string,
    conversationHistory?: Array<{role: 'user' | 'assistant', content: string}>
  ) {
    try {
      console.log(`🏠 [CUSTOMER_UPDATE] === VERIFICANDO INTERESSE EM IMÓVEL ===`);
      console.log(`📞 [CUSTOMER_UPDATE] Phone: ${phone}`);
      console.log(`🏢 [CUSTOMER_UPDATE] Company ID: ${companyId}`);
      console.log(`💬 [CUSTOMER_UPDATE] Mensagem: "${message.substring(0, 100)}..."`);

      const storage = getStorage();

      // Buscar customer existente pelo telefone
      const customer = await storage.getCustomerByPhone(phone, companyId);
      if (!customer) {
        console.log(`⚠️ [CUSTOMER_UPDATE] Customer não encontrado para phone: ${phone}`);
        return;
      }

      console.log(`✅ [CUSTOMER_UPDATE] Customer encontrado: ${customer.id} - ${customer.name}`);
      console.log(`📊 [CUSTOMER_UPDATE] Estado atual - cityId: ${customer.interestedCityId || 'null'}, propertyType: ${customer.interestedPropertyType || 'null'}`);

      // Combinar histórico + mensagem atual para análise
      const fullConversation = [
        ...(conversationHistory || []).map(m => m.content.toLowerCase()),
        message.toLowerCase()
      ].join(' ');

      console.log(`🔍 [CUSTOMER_UPDATE] Analisando conversa: "${fullConversation.substring(0, 200)}..."`);

      // Lista de tipos de imóvel (ordenados por tamanho para evitar falsos positivos)
      const tiposImovelMap: Array<[string, string]> = [
        ['apartamento', 'apartamento'],
        ['chácara', 'chácara'],
        ['chacara', 'chácara'],
        ['sobrado', 'sobrado'],
        ['terreno', 'terreno'],
        ['apto', 'apartamento'],
        ['casa', 'casa'],
        ['sala', 'sala'],
        ['ap', 'apartamento'],
      ];

      let updates: { interestedCityId?: string; interestedPropertyType?: string } = {};
      let shouldUpdate = false;

      // Detectar tipo de imóvel (se ainda não tiver)
      if (!customer.interestedPropertyType) {
        for (const [variacao, tipo] of tiposImovelMap) {
          const regex = new RegExp(`(^|\\s|[^a-záàâãéèêíìîóòôõúùûç])${variacao}($|\\s|[^a-záàâãéèêíìîóòôõúùûç])`, 'i');
          if (regex.test(fullConversation)) {
            updates.interestedPropertyType = tipo;
            shouldUpdate = true;
            console.log(`🏠 [CUSTOMER_UPDATE] Tipo de imóvel detectado: ${tipo}`);
            break;
          }
        }
      }

      // Detectar cidade - buscar diretamente nas cidades cadastradas para a empresa
      if (!customer.interestedCityId) {
        const cities = await storage.getCitiesByCompany(companyId);
        console.log(`🌆 [CUSTOMER_UPDATE] Verificando ${cities.length} cidades cadastradas...`);

        for (const city of cities) {
          const cityNameLower = city.name.toLowerCase();
          // Normalizar removendo acentos para comparação
          const cityNameNormalized = cityNameLower
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
          const conversationNormalized = fullConversation
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

          // Verificar se o nome da cidade aparece na conversa (com ou sem acento)
          if (fullConversation.includes(cityNameLower) || conversationNormalized.includes(cityNameNormalized)) {
            updates.interestedCityId = city.name; // Salva o NOME da cidade, não o ID
            shouldUpdate = true;
            console.log(`🌆 [CUSTOMER_UPDATE] Cidade detectada: ${city.name}`);
            break;
          }
        }
      }

      // Atualizar customer se houver novos dados
      if (shouldUpdate) {
        console.log(`📝 [CUSTOMER_UPDATE] Atualizando customer com:`, updates);
        await storage.updateCustomer(customer.id, updates);
        console.log(`✅ [CUSTOMER_UPDATE] Customer atualizado com sucesso!`);
      } else {
        console.log(`ℹ️ [CUSTOMER_UPDATE] Nenhuma atualização necessária`);
      }

    } catch (error) {
      console.error(`❌ [CUSTOMER_UPDATE] Erro ao atualizar customer:`, error);
    }
  }
}

export const aiService = new AIService();