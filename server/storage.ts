import mysql from 'mysql2/promise';
import {
  User, InsertUser, Company, InsertCompany, GlobalConfiguration,
  InsertGlobalConfiguration, EvolutionApiConfiguration, InsertEvolutionApiConfiguration,
  AiConfiguration, InsertAiConfiguration, WhatsappInstance, InsertWhatsappInstance,
  AiAgent, InsertAiAgent, Conversation, InsertConversation, Message, InsertMessage,
  ContactList, InsertContactList, ContactListItem, InsertContactListItem,
  ScheduledMessage, InsertScheduledMessage, FunnelStage, InsertFunnelStage,
  Customer, InsertCustomer, Lead, InsertLead, Property, InsertProperty,
  Amenity, InsertAmenity, City, InsertCity, CompanyCustomDomain, InsertCompanyCustomDomain,
  WebsiteTemplate, InsertWebsiteTemplate, CompanyWebsite, InsertCompanyWebsite,
  CompanyAgent, InsertCompanyAgent, CompanyTestimonial, InsertCompanyTestimonial,
  Plan, InsertPlan, Broker, InsertBroker, Appointment, InsertAppointment
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllAdminUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<void>;

  // Companies
  getCompany(id: string): Promise<Company | undefined>;
  getCompaniesByUserId(userId: string): Promise<Company[]>;
  getAllCompanies(): Promise<Company[]>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, updates: Partial<Company>): Promise<Company>;
  updateCompanyAdminPassword(companyId: string, hashedPassword: string): Promise<void>;
  deleteCompany(id: string): Promise<void>;
  
  // Global Configurations
  getGlobalConfiguration(): Promise<GlobalConfiguration | undefined>;
  saveGlobalConfiguration(config: InsertGlobalConfiguration): Promise<GlobalConfiguration>;
  
  // Evolution API Configuration
  getEvolutionApiConfiguration(): Promise<EvolutionApiConfiguration | undefined>;
  saveEvolutionApiConfiguration(config: InsertEvolutionApiConfiguration): Promise<EvolutionApiConfiguration>;
  
  // AI Configuration
  getAiConfiguration(): Promise<AiConfiguration | undefined>;
  saveAiConfiguration(config: InsertAiConfiguration): Promise<AiConfiguration>;
  
  // WhatsApp Instances
  getWhatsappInstance(id: string): Promise<WhatsappInstance | undefined>;
  getWhatsappInstanceByEvolutionId(evolutionInstanceId: string): Promise<WhatsappInstance | undefined>;
  getWhatsappInstancesByCompany(companyId: string): Promise<WhatsappInstance[]>;
  createWhatsappInstance(instance: InsertWhatsappInstance): Promise<WhatsappInstance>;
  updateWhatsappInstance(id: string, updates: Partial<WhatsappInstance>): Promise<WhatsappInstance>;
  deleteWhatsappInstance(id: string): Promise<void>;
  
  // AI Agents
  getAiAgent(id: string): Promise<AiAgent | undefined>;
  getAiAgentsByCompany(companyId: string): Promise<AiAgent[]>;
  getMainAgentsByCompany(companyId: string): Promise<AiAgent[]>;
  getSecondaryAgentsByParent(parentAgentId: string): Promise<AiAgent[]>;
  getSecondaryAgentsByCompany(companyId: string): Promise<AiAgent[]>;
  createAiAgent(agent: InsertAiAgent): Promise<AiAgent>;
  updateAiAgent(id: string, updates: Partial<AiAgent>): Promise<AiAgent>;
  deleteAiAgent(id: string): Promise<void>;
  
  // Conversations
  getConversation(id: string): Promise<Conversation | undefined>;
  getConversationsByInstance(instanceId: string): Promise<Conversation[]>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation>;
  
  // Messages
  getMessagesByConversation(conversationId: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  
  // Contact Lists
  getContactList(id: string): Promise<ContactList | undefined>;
  getContactListsByCompany(companyId: string): Promise<ContactList[]>;
  createContactList(list: InsertContactList): Promise<ContactList>;
  updateContactList(id: string, updates: Partial<ContactList>): Promise<ContactList>;
  deleteContactList(id: string): Promise<void>;
  
  // Contact List Items
  getContactListItems(contactListId: string): Promise<ContactListItem[]>;
  createContactListItem(item: InsertContactListItem): Promise<ContactListItem>;
  deleteContactListItems(contactListId: string): Promise<void>;
  
  // Scheduled Messages
  getScheduledMessage(id: string): Promise<ScheduledMessage | undefined>;
  getScheduledMessagesByCompany(companyId: string): Promise<ScheduledMessage[]>;
  getScheduledMessagesByStatus(status: string): Promise<ScheduledMessage[]>;
  getPendingScheduledMessages(): Promise<ScheduledMessage[]>;
  createScheduledMessage(message: InsertScheduledMessage): Promise<ScheduledMessage>;
  updateScheduledMessage(id: string, updates: Partial<ScheduledMessage>): Promise<ScheduledMessage>;
  deleteScheduledMessage(id: string): Promise<void>;
  
  // Additional methods for scheduled message processing
  getWhatsappInstancesByIds(ids: string[]): Promise<WhatsappInstance[]>;
  
  // Funnel Stages (Global - fixed for all companies)
  getFunnelStage(id: string): Promise<FunnelStage | undefined>;
  getGlobalFunnelStages(): Promise<FunnelStage[]>;
  initializeGlobalFunnelStages(): Promise<void>;
  
  // Customers
  getCustomer(id: string): Promise<Customer | undefined>;
  getCustomersByCompany(companyId: string): Promise<Customer[]>;
  getCustomerByPhone(phone: string, companyId: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, updates: Partial<Customer>): Promise<Customer>;
  deleteCustomer(id: string): Promise<void>;

  // Leads
  getLead(id: string): Promise<Lead | undefined>;
  getLeadsByCompany(companyId: string): Promise<Lead[]>;
  getLeadByPhone(phone: string, companyId: string): Promise<Lead | undefined>;
  createLead(lead: InsertLead): Promise<Lead>;
  updateLead(id: string, updates: Partial<Lead>): Promise<Lead>;
  deleteLead(id: string): Promise<void>;

  // Properties
  getProperty(id: string): Promise<Property | undefined>;
  getPropertyByCode(code: string, companyId: string): Promise<Property | undefined>;
  getPropertiesByCompany(companyId: string): Promise<Property[]>;
  searchProperties(companyId: string, filters: {
    city?: string;
    transactionType?: string;
    propertyType?: string;
  }): Promise<Property[]>;
  createProperty(property: InsertProperty): Promise<Property>;
  updateProperty(id: string, updates: Partial<Property>): Promise<Property>;
  deleteProperty(id: string): Promise<void>;

  // Amenities (Comodidades)
  getAmenity(id: string): Promise<Amenity | undefined>;
  getAmenitiesByCompany(companyId: string): Promise<Amenity[]>;
  createAmenity(amenity: InsertAmenity): Promise<Amenity>;
  updateAmenity(id: string, updates: Partial<Amenity>): Promise<Amenity>;
  deleteAmenity(id: string): Promise<void>;

  // Cities (Cidades)
  getCity(id: string): Promise<City | undefined>;
  getCitiesByCompany(companyId: string): Promise<City[]>;
  getCityByName(name: string, companyId: string): Promise<City | undefined>;
  createCity(city: InsertCity): Promise<City>;
  updateCity(id: string, updates: Partial<City>): Promise<City>;
  deleteCity(id: string): Promise<void>;

  // Custom Domains
  getCustomDomain(id: string): Promise<CompanyCustomDomain | undefined>;
  getCustomDomainByHost(host: string): Promise<CompanyCustomDomain | undefined>;
  getCustomDomainsByCompany(companyId: string): Promise<CompanyCustomDomain[]>;
  getLatestCustomDomainByCompany(companyId: string): Promise<CompanyCustomDomain | undefined>;
  getAllCustomDomains(): Promise<CompanyCustomDomain[]>;
  getCustomDomainsByStatus(status: number): Promise<CompanyCustomDomain[]>;
  createCustomDomain(domain: InsertCompanyCustomDomain): Promise<CompanyCustomDomain>;
  updateCustomDomain(id: string, updates: Partial<CompanyCustomDomain>): Promise<CompanyCustomDomain>;
  deleteCustomDomain(id: string): Promise<void>;

  // Website Templates
  getAllWebsiteTemplates(): Promise<WebsiteTemplate[]>;
  getWebsiteTemplate(id: string): Promise<WebsiteTemplate | undefined>;

  // Company Websites
  getCompanyWebsite(companyId: string): Promise<CompanyWebsite | undefined>;
  createCompanyWebsite(website: InsertCompanyWebsite): Promise<CompanyWebsite>;
  updateCompanyWebsite(id: string, updates: Partial<CompanyWebsite>): Promise<CompanyWebsite>;

  // Company Agents
  getCompanyAgent(id: string): Promise<CompanyAgent | undefined>;
  getCompanyAgentsByCompany(companyId: string): Promise<CompanyAgent[]>;
  getActiveCompanyAgents(companyId: string): Promise<CompanyAgent[]>;
  createCompanyAgent(agent: InsertCompanyAgent): Promise<CompanyAgent>;
  updateCompanyAgent(id: string, updates: Partial<CompanyAgent>): Promise<CompanyAgent>;
  deleteCompanyAgent(id: string): Promise<void>;

  // Company Testimonials
  getCompanyTestimonial(id: string): Promise<CompanyTestimonial | undefined>;
  getCompanyTestimonialsByCompany(companyId: string): Promise<CompanyTestimonial[]>;
  getActiveCompanyTestimonials(companyId: string): Promise<CompanyTestimonial[]>;
  createCompanyTestimonial(testimonial: InsertCompanyTestimonial): Promise<CompanyTestimonial>;
  updateCompanyTestimonial(id: string, updates: Partial<CompanyTestimonial>): Promise<CompanyTestimonial>;
  deleteCompanyTestimonial(id: string): Promise<void>;

  // Plans
  getPlan(id: string): Promise<Plan | undefined>;
  getAllPlans(): Promise<Plan[]>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: string, updates: Partial<Plan>): Promise<Plan>;
  deletePlan(id: string): Promise<void>;

  // Brokers (Corretores)
  getBroker(id: string): Promise<Broker | undefined>;
  getBrokersByCompany(companyId: string): Promise<Broker[]>;
  countBrokersByCompany(companyId: string): Promise<number>;
  createBroker(broker: InsertBroker): Promise<Broker>;
  updateBroker(id: string, updates: Partial<Broker>): Promise<Broker>;
  deleteBroker(id: string): Promise<void>;

  // Appointments (Agendamentos)
  getAppointment(id: string): Promise<Appointment | undefined>;
  getAppointmentsByCompany(companyId: string): Promise<Appointment[]>;
  getAppointmentsByBroker(brokerId: string): Promise<Appointment[]>;
  getLastAppointmentOfDayWithBroker(companyId: string): Promise<Appointment | undefined>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: string, updates: Partial<Appointment>): Promise<Appointment>;
  deleteAppointment(id: string): Promise<void>;
}

export class MySQLStorage implements IStorage {
  private connection: mysql.Connection | null = null;
  private isConnected: boolean = false;

  constructor() {
    // Don't connect immediately, wait for init
  }

  async init(): Promise<void> {
    if (this.isConnected) return;
    await this.connect();
    this.isConnected = true;
  }

  private async connect(): Promise<void> {
    try {
      const config = {
        host: process.env.MYSQL_HOST || 'localhost',
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'sistema_multiempresa',
        port: parseInt(process.env.MYSQL_PORT || '3306'),
        charset: 'utf8mb4',
      };
      
      console.log('Database config:', {
        host: config.host,
        user: config.user,
        database: config.database,
        port: config.port
      });
      
      this.connection = await mysql.createConnection(config);
      
      // Create tables if they don't exist
      await this.createTables();
      
      // Fix charset for existing tables
      await this.fixTableCharsets();
    } catch (error) {
      console.error('MySQL connection error:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.connection) throw new Error('No database connection');

    const tables = [
      `CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        email VARCHAR(255) NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'client',
        company_id VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS companies (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        cnpj VARCHAR(18),
        phone VARCHAR(20),
        address TEXT,
        city VARCHAR(100),
        cep VARCHAR(10),
        avatar TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS global_configurations (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        logo TEXT,
        favicon TEXT,
        cores_primaria VARCHAR(7) DEFAULT '#3B82F6',
        cores_secundaria VARCHAR(7) DEFAULT '#6366F1',
        cores_fundo VARCHAR(7) DEFAULT '#F8FAFC',
        nome_sistema VARCHAR(255) DEFAULT 'Sistema Multi-Empresa',
        nome_rodape VARCHAR(255) DEFAULT '© 2024 Multi-Empresa System',
        nome_aba_navegador VARCHAR(255) DEFAULT 'Multi-Empresa Dashboard',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS evolution_api_configurations (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        evolution_url TEXT NOT NULL,
        evolution_token TEXT NOT NULL,
        url_global_sistema TEXT,
        status VARCHAR(20) DEFAULT 'disconnected',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS ai_configurations (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        api_key TEXT NOT NULL,
        modelo VARCHAR(50) DEFAULT 'gpt-4o',
        temperatura DECIMAL(3,2) DEFAULT 0.7,
        numero_tokens INT DEFAULT 1000,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS whatsapp_instances (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        company_id VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        evolution_instance_id VARCHAR(255),
        status VARCHAR(20) DEFAULT 'disconnected',
        qr_code TEXT,
        ai_agent_id VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS ai_agents (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        company_id VARCHAR(36) NOT NULL,
        name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        prompt TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        temperatura DECIMAL(3,2) DEFAULT 0.7,
        numero_tokens INT DEFAULT 1000,
        modelo VARCHAR(50) DEFAULT 'gpt-4o',
        training_files JSON,
        training_content TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
        agent_type VARCHAR(20) DEFAULT 'main',
        parent_agent_id VARCHAR(36),
        specialization VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
        delegation_keywords JSON,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      
      `CREATE TABLE IF NOT EXISTS conversations (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        whatsapp_instance_id VARCHAR(36) NOT NULL,
        contact_name VARCHAR(255),
        contact_phone VARCHAR(20) NOT NULL,
        last_message TEXT,
        last_message_at TIMESTAMP,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        conversation_id VARCHAR(36) NOT NULL,
        content TEXT NOT NULL,
        sender VARCHAR(20) NOT NULL,
        agent_id VARCHAR(36),
        message_type VARCHAR(20) DEFAULT 'text',
        evolution_message_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS contact_lists (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        company_id VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        total_contacts INT DEFAULT 0,
        valid_contacts INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS contact_list_items (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        contact_list_id VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        valid BOOLEAN DEFAULT true,
        error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (contact_list_id) REFERENCES contact_lists(id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS scheduled_messages (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        company_id VARCHAR(36) NOT NULL,
        contact_list_id VARCHAR(36) NOT NULL,
        instance_ids JSON NOT NULL,
        message_type VARCHAR(20) NOT NULL,
        message_content TEXT NOT NULL,
        messages JSON,
        use_multiple_messages BOOLEAN DEFAULT FALSE,
        file_name VARCHAR(255),
        file_base64 LONGTEXT,
        scheduled_date_time TIMESTAMP NOT NULL,
        interval_min INT DEFAULT 60,
        interval_max INT DEFAULT 120,
        use_multiple_instances BOOLEAN DEFAULT FALSE,
        randomize_instances BOOLEAN DEFAULT TRUE,
        status VARCHAR(20) DEFAULT 'scheduled',
        total_messages INT DEFAULT 0,
        sent_messages INT DEFAULT 0,
        failed_messages INT DEFAULT 0,
        started_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS funnel_stages (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        company_id VARCHAR(36) NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        color VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
        \`order\` INT NOT NULL DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        is_global BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS customers (
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
      )`,

      `CREATE TABLE IF NOT EXISTS leads (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        company_id VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        email VARCHAR(255),
        source VARCHAR(255) DEFAULT 'WhatsApp',
        status VARCHAR(50) DEFAULT 'new',
        notes TEXT,
        converted_to_customer BOOLEAN DEFAULT FALSE,
        customer_id VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`
    ];

    for (const table of tables) {
      await this.connection.execute(table);
    }

    // Add agent_id column to existing messages table if it doesn't exist
    try {
      await this.connection.execute(`
        ALTER TABLE messages ADD COLUMN agent_id VARCHAR(36)
      `);
      console.log('✅ Added agent_id column to messages table');
    } catch (error: any) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('✅ agent_id column already exists in messages table');
      } else {
        console.error('❌ Error adding agent_id column:', error);
      }
    }

    // Add image support columns to messages table
    const imageColumns = [
      { name: 'media_url', type: 'TEXT' },
      { name: 'media_base64', type: 'LONGTEXT' },
      { name: 'caption', type: 'TEXT' }
    ];

    for (const column of imageColumns) {
      try {
        await this.connection.execute(`
          ALTER TABLE messages ADD COLUMN ${column.name} ${column.type}
        `);
        console.log(`✅ Added ${column.name} column to messages table`);
      } catch (error: any) {
        if (error.code === 'ER_DUP_FIELDNAME') {
          console.log(`✅ ${column.name} column already exists in messages table`);
          
          // Se a coluna media_base64 já existe, vamos garantir que seja LONGTEXT
          if (column.name === 'media_base64' && column.type === 'LONGTEXT') {
            try {
              await this.connection.execute(`
                ALTER TABLE messages MODIFY COLUMN media_base64 LONGTEXT
              `);
              console.log(`✅ media_base64 column updated to LONGTEXT`);
            } catch (modifyError: any) {
              console.error(`❌ Error modifying media_base64 column:`, modifyError);
            }
          }
        } else {
          console.error(`❌ Error adding ${column.name} column:`, error);
        }
      }
    }

    // Add new property columns
    const propertyColumns = [
      { name: 'has_service_area', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'has_social_bathroom', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'has_tv_room', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'images', type: 'JSON DEFAULT (JSON_ARRAY())' },
      { name: 'youtube_video_url', type: 'VARCHAR(500)' }
    ];

    for (const column of propertyColumns) {
      try {
        await this.connection.execute(`
          ALTER TABLE properties ADD COLUMN ${column.name} ${column.type}
        `);
        console.log(`✅ Added ${column.name} column to properties table`);
      } catch (error: any) {
        if (error.code === 'ER_DUP_FIELDNAME') {
          console.log(`✅ ${column.name} column already exists in properties table`);
        } else {
          console.error(`❌ Error adding ${column.name} column:`, error);
        }
      }
    }

    // Insert default configurations if they don't exist
    await this.insertDefaultConfigurations();
  }

  private async fixTableCharsets(): Promise<void> {
    if (!this.connection) return;
    
    try {
      // Fix ai_agents table charset and add hierarchy columns
      await this.connection.execute(`
        ALTER TABLE ai_agents 
        MODIFY name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
        MODIFY prompt TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
        ADD COLUMN IF NOT EXISTS training_content TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
        ADD COLUMN IF NOT EXISTS agent_type VARCHAR(20) DEFAULT 'main',
        ADD COLUMN IF NOT EXISTS parent_agent_id VARCHAR(36),
        ADD COLUMN IF NOT EXISTS specialization VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
        ADD COLUMN IF NOT EXISTS delegation_keywords JSON
      `);
      console.log('Fixed ai_agents table charset');
    } catch (error: any) {
      console.log('Table charset fix not needed or already applied:', error.message);
    }
  }

  private async insertDefaultConfigurations(): Promise<void> {
    if (!this.connection) return;

    // Check and insert default global configuration
    const [globalRows] = await this.connection.execute(
      'SELECT COUNT(*) as count FROM global_configurations'
    );
    if ((globalRows as any)[0].count === 0) {
      await this.connection.execute(
        'INSERT INTO global_configurations (id) VALUES (UUID())'
      );
    }
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT id, email, password, role, company_id as companyId, created_at as createdAt, updated_at as updatedAt FROM users WHERE id = ?',
      [id]
    );
    return (rows as User[])[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT id, email, password, role, company_id as companyId, created_at as createdAt, updated_at as updatedAt FROM users WHERE email = ?',
      [email]
    );
    return (rows as User[])[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    if (!this.connection) throw new Error('No database connection');

    const id = randomUUID();
    await this.connection.execute(
      'INSERT INTO users (id, name, email, password, role, company_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, user.name || null, user.email, user.password, user.role || 'client', user.companyId || null]
    );
    return this.getUser(id) as Promise<User>;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    if (!this.connection) throw new Error('No database connection');
    
    const fields = Object.keys(updates).filter(key => updates[key as keyof User] !== undefined);
    const values = fields.map(key => updates[key as keyof User]);
    
    if (fields.length > 0) {
      const setClause = fields.map(field => `${field} = ?`).join(', ');
      await this.connection.execute(
        `UPDATE users SET ${setClause} WHERE id = ?`,
        [...values, id]
      );
    }
    
    return this.getUser(id) as Promise<User>;
  }

  async getAllAdminUsers(): Promise<User[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT id, name, email, role, company_id as companyId, created_at as createdAt, updated_at as updatedAt FROM users WHERE role = ? ORDER BY created_at DESC',
      ['admin']
    );
    return (rows as any[]).map(row => ({
      ...row,
      password: '', // Never return password
    }));
  }

  async deleteUser(id: string): Promise<void> {
    if (!this.connection) throw new Error('No database connection');

    await this.connection.execute(
      'DELETE FROM users WHERE id = ?',
      [id]
    );
  }

  // Company methods
  async getCompany(id: string): Promise<Company | undefined> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM companies WHERE id = ?',
      [id]
    );
    const companies = rows as any[];
    return companies.length > 0 ? this.mapCompanyRow(companies[0]) : undefined;
  }

  async getCompaniesByUserId(userId: string): Promise<Company[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT c.* FROM companies c JOIN users u ON c.id = u.company_id WHERE u.id = ?',
      [userId]
    );
    return (rows as any[]).map(row => this.mapCompanyRow(row));
  }

  async getAllCompanies(): Promise<Company[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute('SELECT * FROM companies ORDER BY created_at DESC');
    return (rows as any[]).map(row => this.mapCompanyRow(row));
  }

  private mapCompanyRow(row: any): Company {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      cnpj: row.cnpj,
      phone: row.phone,
      address: row.address,
      city: row.city,
      cep: row.cep,
      avatar: row.avatar,
      responsibleName: row.responsible_name,
      responsiblePhone: row.responsible_phone,
      responsibleEmail: row.responsible_email,
      planId: row.plan_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    if (!this.connection) throw new Error('No database connection');
    
    const id = randomUUID();
    
    // Garantir que valores undefined sejam convertidos para null
    const email = company.email || null;
    const cnpj = company.cnpj || null;
    const phone = company.phone || null;
    const address = company.address || null;
    const city = company.city || null;
    const cep = company.cep || null;
    const avatar = company.avatar || null;
    
    await this.connection.execute(
      'INSERT INTO companies (id, name, email, cnpj, phone, address, city, cep, avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, company.name, email, cnpj, phone, address, city, cep, avatar]
    );
    return this.getCompany(id) as Promise<Company>;
  }

  async updateCompany(id: string, updates: Partial<Company>): Promise<Company> {
    if (!this.connection) throw new Error('No database connection');

    // Mapeamento de campos camelCase para snake_case
    const fieldMap: Record<string, string> = {
      name: 'name',
      email: 'email',
      cnpj: 'cnpj',
      phone: 'phone',
      address: 'address',
      city: 'city',
      cep: 'cep',
      avatar: 'avatar',
      responsibleName: 'responsible_name',
      responsiblePhone: 'responsible_phone',
      responsibleEmail: 'responsible_email',
      planId: 'plan_id',
      status: 'status',
    };

    const setClauses: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && fieldMap[key]) {
        setClauses.push(`${fieldMap[key]} = ?`);
        values.push(value);
      }
    }

    if (setClauses.length > 0) {
      values.push(id);
      await this.connection.execute(
        `UPDATE companies SET ${setClauses.join(', ')} WHERE id = ?`,
        values
      );
    }

    return this.getCompany(id) as Promise<Company>;
  }

  async updateCompanyAdminPassword(companyId: string, hashedPassword: string): Promise<void> {
    if (!this.connection) throw new Error('No database connection');
    
    // Encontrar o usuário admin da empresa e atualizar sua senha
    await this.connection.execute(
      'UPDATE users SET password = ? WHERE company_id = ? AND role = "client"',
      [hashedPassword, companyId]
    );
  }

  async deleteCompany(id: string): Promise<void> {
    if (!this.connection) throw new Error('No database connection');
    
    await this.connection.execute('DELETE FROM companies WHERE id = ?', [id]);
  }

  // Global Configuration methods
  async getGlobalConfiguration(): Promise<GlobalConfiguration | undefined> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute('SELECT * FROM global_configurations LIMIT 1');
    return (rows as GlobalConfiguration[])[0];
  }

  async saveGlobalConfiguration(config: InsertGlobalConfiguration): Promise<GlobalConfiguration> {
    if (!this.connection) throw new Error('No database connection');
    
    const existing = await this.getGlobalConfiguration();
    
    if (existing) {
      const fields = Object.keys(config).filter(key => config[key as keyof InsertGlobalConfiguration] !== undefined);
      const values = fields.map(key => config[key as keyof InsertGlobalConfiguration]);
      
      if (fields.length > 0) {
        const setClause = fields.map(field => `${field} = ?`).join(', ');
        await this.connection.execute(
          `UPDATE global_configurations SET ${setClause} WHERE id = ?`,
          [...values, existing.id]
        );
      }
      
      return this.getGlobalConfiguration() as Promise<GlobalConfiguration>;
    } else {
      const id = randomUUID();
      await this.connection.execute(
        'INSERT INTO global_configurations (id, logo, favicon, cores_primaria, cores_secundaria, cores_fundo, nome_sistema, nome_rodape, nome_aba_navegador, webshare_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, config.logo, config.favicon, config.cores_primaria, config.cores_secundaria, config.cores_fundo, config.nome_sistema, config.nome_rodape, config.nome_aba_navegador, config.webshare_token]
      );
      return this.getGlobalConfiguration() as Promise<GlobalConfiguration>;
    }
  }

  // Evolution API Configuration methods
  async getEvolutionApiConfiguration(): Promise<EvolutionApiConfiguration | undefined> {
    if (!this.connection) throw new Error('No database connection');
    
    console.log('🔍 [DEBUG] Getting Evolution API configuration from database...');
    const [rows] = await this.connection.execute('SELECT * FROM evolution_api_configurations LIMIT 1') as any;
    console.log(`🔍 [DEBUG] Evolution API config query returned ${rows.length} rows`);
    
    const rawData = rows[0];
    if (!rawData) {
      console.log('❌ [DEBUG] No Evolution API configuration found in database');
      return undefined;
    }
    
    console.log('✅ [DEBUG] Evolution API config found:', {
      id: rawData.id,
      evolution_url: rawData.evolution_url ? 'SET' : 'NULL',
      evolution_token: rawData.evolution_token ? 'SET' : 'NULL'
    });
    
    // Mapeamento dos campos do banco para o frontend
    const mappedConfig = {
      id: rawData.id,
      evolutionURL: rawData.evolution_url,
      evolutionToken: rawData.evolution_token,
      urlGlobalSistema: rawData.url_global_sistema,
      updatedAt: rawData.updated_at,
    } as EvolutionApiConfiguration;
    
    console.log('🔧 [DEBUG] Mapped Evolution API config:', {
      evolutionURL: mappedConfig.evolutionURL ? 'SET' : 'NULL',
      evolutionToken: mappedConfig.evolutionToken ? 'SET' : 'NULL',
      baseURL: mappedConfig.evolutionURL,
      token: mappedConfig.evolutionToken
    });
    
    return mappedConfig;
  }

  async saveEvolutionApiConfiguration(config: InsertEvolutionApiConfiguration): Promise<EvolutionApiConfiguration> {
    if (!this.connection) throw new Error('No database connection');
    
    console.log('Save evolution config:', config);
    
    const existing = await this.getEvolutionApiConfiguration();
    
    // Garantir que os valores não sejam undefined
    const evolutionURL = config.evolutionURL || null;
    const evolutionToken = config.evolutionToken || null;
    const urlGlobalSistema = config.urlGlobalSistema || null;
    
    if (existing) {
      await this.connection.execute(
        'UPDATE evolution_api_configurations SET evolution_url = ?, evolution_token = ?, url_global_sistema = ? WHERE id = ?',
        [evolutionURL, evolutionToken, urlGlobalSistema, existing.id]
      );
    } else {
      const id = randomUUID();
      await this.connection.execute(
        'INSERT INTO evolution_api_configurations (id, evolution_url, evolution_token, url_global_sistema) VALUES (?, ?, ?, ?)',
        [id, evolutionURL, evolutionToken, urlGlobalSistema]
      );
    }
    
    return this.getEvolutionApiConfiguration() as Promise<EvolutionApiConfiguration>;
  }

  // AI Configuration methods
  async getAiConfiguration(): Promise<AiConfiguration | undefined> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute('SELECT * FROM ai_configurations LIMIT 1') as any;
    const rawData = rows[0];
    if (!rawData) return undefined;
    
    // Mapeamento dos campos do banco para o frontend
    const config = {
      id: rawData.id,
      apiKey: rawData.api_key,
      modelo: rawData.modelo,
      temperatura: rawData.temperatura?.toString() || "0.7",
      numeroTokens: parseInt(rawData.numero_tokens?.toString() || "1000"),
      updatedAt: rawData.updated_at,
    } as AiConfiguration;
    
    console.log(`📊 Storage returning AI config:`, config);
    return config;
  }

  async saveAiConfiguration(config: InsertAiConfiguration): Promise<AiConfiguration> {
    if (!this.connection) throw new Error('No database connection');
    
    console.log('Save AI config:', config);
    
    const existing = await this.getAiConfiguration();
    
    // Garantir que os valores não sejam undefined
    const apiKey = config.apiKey || null;
    const modelo = config.modelo || 'gpt-4o';
    const temperatura = config.temperatura ? parseFloat(config.temperatura.toString()) : 0.7;
    const numeroTokens = config.numeroTokens ? parseInt(config.numeroTokens.toString()) : 1000;
    
    if (existing) {
      await this.connection.execute(
        'UPDATE ai_configurations SET api_key = ?, modelo = ?, temperatura = ?, numero_tokens = ? WHERE id = ?',
        [apiKey, modelo, temperatura, numeroTokens, existing.id]
      );
    } else {
      const id = randomUUID();
      await this.connection.execute(
        'INSERT INTO ai_configurations (id, api_key, modelo, temperatura, numero_tokens) VALUES (?, ?, ?, ?, ?)',
        [id, apiKey, modelo, temperatura, numeroTokens]
      );
    }
    
    return this.getAiConfiguration() as Promise<AiConfiguration>;
  }

  // WhatsApp Instance methods
  async getWhatsappInstance(id: string): Promise<WhatsappInstance | undefined> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM whatsapp_instances WHERE id = ?',
      [id]
    );
    const row = (rows as any[])[0];
    if (!row) return undefined;
    
    // Convert snake_case to camelCase
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      status: row.status, // Explicitly map status field
      companyId: row.company_id,
      evolutionInstanceId: row.evolution_instance_id,
      qrCode: row.qr_code,
      aiAgentId: row.ai_agent_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    } as WhatsappInstance;
  }

  async getWhatsappInstanceByEvolutionId(evolutionInstanceId: string): Promise<WhatsappInstance | undefined> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM whatsapp_instances WHERE evolution_instance_id = ?',
      [evolutionInstanceId]
    );
    const row = (rows as any[])[0];
    if (!row) return undefined;

    // Convert snake_case to camelCase
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      status: row.status,
      evolutionInstanceId: row.evolution_instance_id,
      companyId: row.company_id,
      aiAgentId: row.ai_agent_id || null,
      qrCode: row.qr_code || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    } as WhatsappInstance;
  }

  async getWhatsappInstancesByCompany(companyId: string): Promise<WhatsappInstance[]> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM whatsapp_instances WHERE company_id = ? ORDER BY created_at DESC',
      [companyId]
    );
    
    // Convert snake_case to camelCase for all rows
    return (rows as any[]).map(row => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      status: row.status, // Explicitly map status field
      companyId: row.company_id,
      evolutionInstanceId: row.evolution_instance_id,
      qrCode: row.qr_code,
      aiAgentId: row.ai_agent_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })) as WhatsappInstance[];
  }

  async createWhatsappInstance(instance: InsertWhatsappInstance): Promise<WhatsappInstance> {
    if (!this.connection) throw new Error('No database connection');
    
    const id = randomUUID();
    await this.connection.execute(
      'INSERT INTO whatsapp_instances (id, company_id, name, phone, evolution_instance_id, status, ai_agent_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        id, 
        instance.companyId || null, 
        instance.name || null, 
        instance.phone || null, 
        instance.evolutionInstanceId || null,
        instance.status || 'disconnected',
        instance.aiAgentId || null
      ]
    );
    
    const createdInstance = await this.getWhatsappInstance(id);
    return createdInstance as WhatsappInstance;
  }

  async updateWhatsappInstance(id: string, updates: Partial<WhatsappInstance>): Promise<WhatsappInstance> {
    if (!this.connection) throw new Error('No database connection');
    
    // Map camelCase to snake_case for MySQL columns
    const fieldMapping: Record<string, string> = {
      companyId: 'company_id',
      aiAgentId: 'ai_agent_id',
      evolutionInstanceId: 'evolution_instance_id',
      qrCode: 'qr_code',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    };
    
    const fields = Object.keys(updates).filter(key => updates[key as keyof WhatsappInstance] !== undefined);
    const values = fields.map(key => updates[key as keyof WhatsappInstance]);
    
    if (fields.length > 0) {
      const setClause = fields.map(field => `${fieldMapping[field] || field} = ?`).join(', ');
      await this.connection.execute(
        `UPDATE whatsapp_instances SET ${setClause} WHERE id = ?`,
        [...values, id]
      );
    }
    
    return this.getWhatsappInstance(id) as Promise<WhatsappInstance>;
  }

  async deleteWhatsappInstance(id: string): Promise<void> {
    if (!this.connection) throw new Error('No database connection');
    
    await this.connection.execute('DELETE FROM whatsapp_instances WHERE id = ?', [id]);
  }

  // AI Agent methods
  async getAiAgent(id: string): Promise<AiAgent | undefined> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM ai_agents WHERE id = ?',
      [id]
    );
    const parsedAgents = this.parseAiAgents(rows as any[]);
    return parsedAgents[0];
  }

  async getAiAgentsByCompany(companyId: string): Promise<AiAgent[]> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM ai_agents WHERE company_id = ? ORDER BY created_at DESC',
      [companyId]
    );
    return this.parseAiAgents(rows as any[]);
  }

  private parseAiAgents(rows: any[]): AiAgent[] {
    return rows.map(row => ({
      ...row,
      trainingFiles: row.training_files ? JSON.parse(row.training_files) : [],
      delegationKeywords: row.delegation_keywords ? JSON.parse(row.delegation_keywords) : [],
      agentType: row.agent_type,
      parentAgentId: row.parent_agent_id,
      trainingContent: row.training_content,
      companyId: row.company_id,
      numeroTokens: row.numero_tokens,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async createAiAgent(agent: InsertAiAgent): Promise<AiAgent> {
    if (!this.connection) throw new Error('No database connection');
    
    const id = randomUUID();
    await this.connection.execute(
      'INSERT INTO ai_agents (id, company_id, name, prompt, temperatura, numero_tokens, modelo, training_files, training_content, agent_type, parent_agent_id, specialization, delegation_keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id, 
        agent.companyId, 
        agent.name, 
        agent.prompt, 
        agent.temperatura, 
        agent.numeroTokens, 
        agent.modelo, 
        JSON.stringify(agent.trainingFiles || []), 
        agent.trainingContent || null,
        agent.agentType || 'main',
        agent.parentAgentId || null,
        agent.specialization || null,
        JSON.stringify(agent.delegationKeywords || [])
      ]
    );
    return this.getAiAgent(id) as Promise<AiAgent>;
  }

  async updateAiAgent(id: string, updates: Partial<AiAgent>): Promise<AiAgent> {
    if (!this.connection) throw new Error('No database connection');
    
    const fieldMapping: Record<string, string> = {
      companyId: 'company_id',
      numeroTokens: 'numero_tokens',
      trainingFiles: 'training_files',
      trainingContent: 'training_content',
      agentType: 'agent_type',
      parentAgentId: 'parent_agent_id',
      delegationKeywords: 'delegation_keywords',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    };
    
    const fields = Object.keys(updates).filter(key => updates[key as keyof AiAgent] !== undefined);
    const values = fields.map(key => {
      const value = updates[key as keyof AiAgent];
      if (key === 'trainingFiles' || key === 'delegationKeywords') {
        return JSON.stringify(value);
      }
      return value;
    });
    
    if (fields.length > 0) {
      const setClause = fields.map(field => `${fieldMapping[field] || field} = ?`).join(', ');
      await this.connection.execute(
        `UPDATE ai_agents SET ${setClause} WHERE id = ?`,
        [...values, id]
      );
    }
    
    return this.getAiAgent(id) as Promise<AiAgent>;
  }

  async getMainAgentsByCompany(companyId: string): Promise<AiAgent[]> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM ai_agents WHERE company_id = ? AND (agent_type = "main" OR agent_type IS NULL) ORDER BY created_at DESC',
      [companyId]
    );
    return this.parseAiAgents(rows as any[]);
  }

  async getSecondaryAgentsByParent(parentAgentId: string): Promise<AiAgent[]> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM ai_agents WHERE parent_agent_id = ? AND agent_type = "secondary" ORDER BY created_at DESC',
      [parentAgentId]
    );
    return this.parseAiAgents(rows as any[]);
  }

  async getSecondaryAgentsByCompany(companyId: string): Promise<AiAgent[]> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM ai_agents WHERE company_id = ? AND agent_type = "secondary" ORDER BY created_at DESC',
      [companyId]
    );
    return this.parseAiAgents(rows as any[]);
  }

  async deleteAiAgent(id: string): Promise<void> {
    if (!this.connection) throw new Error('No database connection');
    
    // First delete all secondary agents that have this agent as parent
    await this.connection.execute('DELETE FROM ai_agents WHERE parent_agent_id = ?', [id]);
    // Then delete the agent itself
    await this.connection.execute('DELETE FROM ai_agents WHERE id = ?', [id]);
  }

  // Conversation methods
  async getConversation(id: string): Promise<Conversation | undefined> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM conversations WHERE id = ?',
      [id]
    );
    return (rows as Conversation[])[0];
  }

  async getConversationsByInstance(instanceId: string): Promise<Conversation[]> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM conversations WHERE whatsapp_instance_id = ? ORDER BY last_message_at DESC',
      [instanceId]
    );
    
    // Debug: verificar o que está sendo retornado do MySQL
    const rawResults = rows as any[];
    console.log(`🔍 [STORAGE] Raw MySQL results for instance ${instanceId}:`, 
      rawResults.map(r => ({ 
        id: r.id, 
        contact_phone: r.contact_phone, 
        contactPhone: r.contactPhone,
        raw_keys: Object.keys(r)
      }))
    );
    
    // Mapear manualmente se necessário (corrigir snake_case para camelCase)
    const mappedRows = rawResults.map(row => ({
      id: row.id,
      whatsappInstanceId: row.whatsapp_instance_id,
      contactName: row.contact_name,
      contactPhone: row.contact_phone, // Mapear explicitamente
      lastMessage: row.last_message,
      lastMessageAt: row.last_message_at,
      status: row.status,
      createdAt: row.created_at
    }));
    
    console.log(`🔍 [STORAGE] Mapped results:`, 
      mappedRows.map(r => ({ id: r.id, contactPhone: r.contactPhone }))
    );
    
    return mappedRows as Conversation[];
  }

  async createConversation(conversation: InsertConversation): Promise<Conversation> {
    if (!this.connection) throw new Error('No database connection');
    
    const id = randomUUID();
    await this.connection.execute(
      'INSERT INTO conversations (id, whatsapp_instance_id, contact_name, contact_phone, last_message) VALUES (?, ?, ?, ?, ?)',
      [id, conversation.whatsappInstanceId || null, conversation.contactName || null, conversation.contactPhone || null, conversation.lastMessage || null]
    );
    return this.getConversation(id) as Promise<Conversation>;
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation> {
    if (!this.connection) throw new Error('No database connection');
    
    const fields = Object.keys(updates).filter(key => updates[key as keyof Conversation] !== undefined);
    const values = fields.map(key => updates[key as keyof Conversation]);
    
    if (fields.length > 0) {
      const setClause = fields.map(field => `${field} = ?`).join(', ');
      await this.connection.execute(
        `UPDATE conversations SET ${setClause} WHERE id = ?`,
        [...values, id]
      );
    }
    
    return this.getConversation(id) as Promise<Conversation>;
  }

  // Message methods
  async getMessagesByConversation(conversationId: string): Promise<Message[]> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [conversationId]
    );
    
    // Mapear manualmente campos snake_case para camelCase
    const rawResults = rows as any[];
    const mappedRows = rawResults.map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      content: row.content,
      sender: row.sender,
      agentId: row.agent_id, // ✅ Mapear agent_id para agentId
      messageType: row.message_type,
      evolutionMessageId: row.evolution_message_id,
      mediaUrl: row.media_url,
      mediaBase64: row.media_base64,
      caption: row.caption,
      createdAt: row.created_at
    }));
    
    return mappedRows as Message[];
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    if (!this.connection) throw new Error('No database connection');
    
    const id = randomUUID();
    await this.connection.execute(
      'INSERT INTO messages (id, conversation_id, content, sender, agent_id, message_type, evolution_message_id, media_url, media_base64, caption) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id, 
        message.conversationId, 
        message.content, 
        message.sender, 
        message.agentId || null, // Incluir o agentId
        message.messageType || 'text', 
        message.evolutionMessageId || null,
        message.mediaUrl || null,
        message.mediaBase64 || null,
        message.caption || null
      ]
    );
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM messages WHERE id = ?',
      [id]
    );
    
    // Mapear campos snake_case para camelCase também no createMessage
    const rawRow = (rows as any[])[0];
    return {
      id: rawRow.id,
      conversationId: rawRow.conversation_id,
      content: rawRow.content,
      sender: rawRow.sender,
      agentId: rawRow.agent_id,
      messageType: rawRow.message_type,
      evolutionMessageId: rawRow.evolution_message_id,
      mediaUrl: rawRow.media_url,
      mediaBase64: rawRow.media_base64,
      caption: rawRow.caption,
      createdAt: rawRow.created_at
    } as Message;
  }

  // Contact Lists methods
  async getContactList(id: string): Promise<ContactList | undefined> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM contact_lists WHERE id = ?',
      [id]
    );
    const row = (rows as any[])[0];
    if (!row) return undefined;
    
    return {
      ...row,
      companyId: row.company_id,
      totalContacts: row.total_contacts,
      validContacts: row.valid_contacts,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    } as ContactList;
  }

  async getContactListsByCompany(companyId: string): Promise<ContactList[]> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM contact_lists WHERE company_id = ? ORDER BY created_at DESC',
      [companyId]
    );
    
    return (rows as any[]).map(row => ({
      ...row,
      companyId: row.company_id,
      totalContacts: row.total_contacts,
      validContacts: row.valid_contacts,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })) as ContactList[];
  }

  async createContactList(list: InsertContactList): Promise<ContactList> {
    if (!this.connection) throw new Error('No database connection');
    
    const id = randomUUID();
    await this.connection.execute(
      'INSERT INTO contact_lists (id, company_id, name, total_contacts, valid_contacts) VALUES (?, ?, ?, ?, ?)',
      [id, list.companyId, list.name, list.totalContacts || 0, list.validContacts || 0]
    );
    
    return this.getContactList(id) as Promise<ContactList>;
  }

  async updateContactList(id: string, updates: Partial<ContactList>): Promise<ContactList> {
    if (!this.connection) throw new Error('No database connection');
    
    const fieldMapping: Record<string, string> = {
      companyId: 'company_id',
      totalContacts: 'total_contacts',
      validContacts: 'valid_contacts',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    };
    
    const fields = Object.keys(updates).filter(key => updates[key as keyof ContactList] !== undefined);
    const values = fields.map(key => updates[key as keyof ContactList]);
    
    if (fields.length > 0) {
      const setClause = fields.map(field => `${fieldMapping[field] || field} = ?`).join(', ');
      await this.connection.execute(
        `UPDATE contact_lists SET ${setClause} WHERE id = ?`,
        [...values, id]
      );
    }
    
    return this.getContactList(id) as Promise<ContactList>;
  }

  async deleteContactList(id: string): Promise<void> {
    if (!this.connection) throw new Error('No database connection');
    
    // Items will be deleted automatically due to CASCADE foreign key
    await this.connection.execute('DELETE FROM contact_lists WHERE id = ?', [id]);
  }

  // Contact List Items methods
  async getContactListItems(contactListId: string): Promise<ContactListItem[]> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM contact_list_items WHERE contact_list_id = ? ORDER BY created_at ASC',
      [contactListId]
    );
    
    return (rows as any[]).map(row => ({
      ...row,
      contactListId: row.contact_list_id,
      createdAt: row.created_at
    })) as ContactListItem[];
  }

  async createContactListItem(item: InsertContactListItem): Promise<ContactListItem> {
    if (!this.connection) throw new Error('No database connection');
    
    const id = randomUUID();
    await this.connection.execute(
      'INSERT INTO contact_list_items (id, contact_list_id, name, phone, valid, error) VALUES (?, ?, ?, ?, ?, ?)',
      [id, item.contactListId, item.name, item.phone, item.valid ?? true, item.error || null]
    );
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM contact_list_items WHERE id = ?',
      [id]
    );
    
    const row = (rows as any[])[0];
    return {
      ...row,
      contactListId: row.contact_list_id,
      createdAt: row.created_at
    } as ContactListItem;
  }

  async deleteContactListItems(contactListId: string): Promise<void> {
    if (!this.connection) throw new Error('No database connection');
    
    await this.connection.execute('DELETE FROM contact_list_items WHERE contact_list_id = ?', [contactListId]);
  }

  // Scheduled Messages Methods
  // Helper to format MySQL datetime for local timezone
  private formatDateTimeForLocal(mysqlDateTime: any): string {
    if (!mysqlDateTime) return mysqlDateTime;
    
    // MySQL returns datetime without timezone info
    // We need to ensure it's treated as local time
    const dateStr = mysqlDateTime.toString();
    
    // If it's already in ISO format with Z, remove the Z
    if (dateStr.endsWith('Z')) {
      return dateStr.slice(0, -1);
    }
    
    // If it's in MySQL format (YYYY-MM-DD HH:MM:SS), return as is
    // The frontend will parse it as local time
    return dateStr;
  }

  async getScheduledMessage(id: string): Promise<ScheduledMessage | undefined> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM scheduled_messages WHERE id = ?',
      [id]
    );
    
    const messages = rows as any[];
    if (messages.length === 0) return undefined;
    
    const message = messages[0];
    return {
      id: message.id,
      companyId: message.company_id,
      contactListId: message.contact_list_id,
      instanceIds: JSON.parse(message.instance_ids || '[]'),
      messageType: message.message_type,
      messageContent: message.message_content,
      messages: message.messages ? JSON.parse(message.messages) : null,
      useMultipleMessages: !!message.use_multiple_messages,
      fileName: message.file_name,
      fileBase64: message.file_base64,
      scheduledDateTime: this.formatDateTimeForLocal(message.scheduled_date_time),
      intervalMin: message.interval_min,
      intervalMax: message.interval_max,
      useMultipleInstances: !!message.use_multiple_instances,
      randomizeInstances: !!message.randomize_instances,
      status: message.status,
      totalMessages: message.total_messages,
      sentMessages: message.sent_messages,
      failedMessages: message.failed_messages,
      startedAt: message.started_at,
      completedAt: message.completed_at,
      errorMessage: message.error_message,
      createdAt: message.created_at,
      updatedAt: message.updated_at,
    };
  }

  async getScheduledMessagesByCompany(companyId: string): Promise<ScheduledMessage[]> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM scheduled_messages WHERE company_id = ? ORDER BY created_at DESC',
      [companyId]
    );
    
    const messages = rows as any[];
    return messages.map(message => ({
      id: message.id,
      companyId: message.company_id,
      contactListId: message.contact_list_id,
      instanceIds: JSON.parse(message.instance_ids || '[]'),
      messageType: message.message_type,
      messageContent: message.message_content,
      messages: message.messages ? JSON.parse(message.messages) : null,
      useMultipleMessages: !!message.use_multiple_messages,
      fileName: message.file_name,
      fileBase64: message.file_base64,
      scheduledDateTime: this.formatDateTimeForLocal(message.scheduled_date_time),
      intervalMin: message.interval_min,
      intervalMax: message.interval_max,
      useMultipleInstances: !!message.use_multiple_instances,
      randomizeInstances: !!message.randomize_instances,
      status: message.status,
      totalMessages: message.total_messages,
      sentMessages: message.sent_messages,
      failedMessages: message.failed_messages,
      startedAt: message.started_at,
      completedAt: message.completed_at,
      errorMessage: message.error_message,
      createdAt: message.created_at,
      updatedAt: message.updated_at,
    }));
  }

  async getPendingScheduledMessages(): Promise<ScheduledMessage[]> {
    if (!this.connection) throw new Error('No database connection');
    
    // Use local time for comparison, not UTC
    // Convert current local time to MySQL format
    const now = new Date();
    const mysqlNow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    console.log(`🕐 [Storage] Checking for messages scheduled before: ${mysqlNow}`);
    
    // First, let's see all scheduled messages regardless of time (for debugging)
    const [debugRows] = await this.connection.execute(
      'SELECT id, status, scheduled_date_time FROM scheduled_messages WHERE status = "scheduled" ORDER BY scheduled_date_time DESC LIMIT 10',
      []
    );
    console.log(`🔍 [Storage DEBUG] All scheduled messages:`, debugRows);
    
    // Also check recently completed messages (might have been processed already)
    const [recentRows] = await this.connection.execute(
      'SELECT id, status, scheduled_date_time, completed_at, sent_messages, failed_messages FROM scheduled_messages WHERE status IN ("completed", "processing", "failed") AND scheduled_date_time >= CURDATE() ORDER BY updated_at DESC LIMIT 5',
      []
    );
    console.log(`🔍 [Storage DEBUG] Recent non-scheduled messages:`, recentRows);
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM scheduled_messages WHERE status = "scheduled" AND scheduled_date_time <= ? ORDER BY scheduled_date_time ASC',
      [mysqlNow]
    );
    
    const messages = rows as any[];
    return messages.map(message => ({
      id: message.id,
      companyId: message.company_id,
      contactListId: message.contact_list_id,
      instanceIds: JSON.parse(message.instance_ids || '[]'),
      messageType: message.message_type,
      messageContent: message.message_content,
      messages: message.messages ? JSON.parse(message.messages) : null,
      useMultipleMessages: !!message.use_multiple_messages,
      fileName: message.file_name,
      fileBase64: message.file_base64,
      scheduledDateTime: this.formatDateTimeForLocal(message.scheduled_date_time),
      intervalMin: message.interval_min,
      intervalMax: message.interval_max,
      useMultipleInstances: !!message.use_multiple_instances,
      randomizeInstances: !!message.randomize_instances,
      status: message.status,
      totalMessages: message.total_messages,
      sentMessages: message.sent_messages,
      failedMessages: message.failed_messages,
      startedAt: message.started_at,
      completedAt: message.completed_at,
      errorMessage: message.error_message,
      createdAt: message.created_at,
      updatedAt: message.updated_at,
    }));
  }

  async createScheduledMessage(message: InsertScheduledMessage): Promise<ScheduledMessage> {
    if (!this.connection) throw new Error('No database connection');
    
    const id = randomUUID();
    
    await this.connection.execute(
      `INSERT INTO scheduled_messages (
        id, company_id, contact_list_id, instance_ids, message_type, message_content, 
        messages, use_multiple_messages, file_name, file_base64, scheduled_date_time, 
        interval_min, interval_max, use_multiple_instances, randomize_instances, 
        total_messages, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        message.companyId,
        message.contactListId,
        JSON.stringify(message.instanceIds),
        message.messageType,
        message.messageContent,
        message.messages ? JSON.stringify(message.messages) : null,
        message.useMultipleMessages ? 1 : 0,
        message.fileName || null,
        message.fileBase64 || null,
        message.scheduledDateTime,
        message.intervalMin,
        message.intervalMax,
        message.useMultipleInstances ? 1 : 0,
        message.randomizeInstances ? 1 : 0,
        message.totalMessages,
        'scheduled'
      ]
    );
    
    const createdMessage = await this.getScheduledMessage(id);
    if (!createdMessage) throw new Error('Failed to create scheduled message');
    
    return createdMessage;
  }

  async updateScheduledMessage(id: string, updates: Partial<ScheduledMessage>): Promise<ScheduledMessage> {
    if (!this.connection) throw new Error('No database connection');
    
    console.log(`📝 [Storage] Updating scheduled message ${id} with:`, updates);
    
    const setParts: string[] = [];
    const values: any[] = [];
    
    if (updates.status !== undefined) {
      setParts.push('status = ?');
      values.push(updates.status);
      console.log(`📝 [Storage] Setting status to: ${updates.status}`);
    }
    
    if (updates.sentMessages !== undefined) {
      setParts.push('sent_messages = ?');
      values.push(updates.sentMessages);
    }
    
    if (updates.failedMessages !== undefined) {
      setParts.push('failed_messages = ?');
      values.push(updates.failedMessages);
    }
    
    if (updates.startedAt !== undefined) {
      setParts.push('started_at = ?');
      // Convert startedAt to local time format for MySQL
      const startedAt = updates.startedAt instanceof Date ? updates.startedAt : new Date(updates.startedAt);
      const mysqlDateTime = `${startedAt.getFullYear()}-${String(startedAt.getMonth() + 1).padStart(2, '0')}-${String(startedAt.getDate()).padStart(2, '0')} ${String(startedAt.getHours()).padStart(2, '0')}:${String(startedAt.getMinutes()).padStart(2, '0')}:${String(startedAt.getSeconds()).padStart(2, '0')}`;
      values.push(mysqlDateTime);
      console.log(`📝 [Storage] Setting startedAt to local time: ${mysqlDateTime}`);
    }
    
    if (updates.completedAt !== undefined) {
      setParts.push('completed_at = ?');
      // Convert completedAt to local time format for MySQL
      const completedAt = updates.completedAt instanceof Date ? updates.completedAt : new Date(updates.completedAt);
      const mysqlDateTime = `${completedAt.getFullYear()}-${String(completedAt.getMonth() + 1).padStart(2, '0')}-${String(completedAt.getDate()).padStart(2, '0')} ${String(completedAt.getHours()).padStart(2, '0')}:${String(completedAt.getMinutes()).padStart(2, '0')}:${String(completedAt.getSeconds()).padStart(2, '0')}`;
      values.push(mysqlDateTime);
      console.log(`📝 [Storage] Setting completedAt to local time: ${mysqlDateTime}`);
    }
    
    if (updates.errorMessage !== undefined) {
      setParts.push('error_message = ?');
      values.push(updates.errorMessage);
    }
    
    if (setParts.length === 0) {
      const message = await this.getScheduledMessage(id);
      if (!message) throw new Error('Scheduled message not found');
      return message;
    }
    
    values.push(id);
    
    const query = `UPDATE scheduled_messages SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = ?`;
    console.log(`📝 [Storage] Executing query: ${query}`);
    console.log(`📝 [Storage] With values:`, values);
    
    await this.connection.execute(query, values);
    
    const updatedMessage = await this.getScheduledMessage(id);
    if (!updatedMessage) throw new Error('Failed to update scheduled message');
    
    console.log(`✅ [Storage] Updated message status: ${updatedMessage.status}, sent: ${updatedMessage.sentMessages}, failed: ${updatedMessage.failedMessages}`);
    
    return updatedMessage;
  }

  async deleteScheduledMessage(id: string): Promise<void> {
    if (!this.connection) throw new Error('No database connection');
    
    await this.connection.execute('DELETE FROM scheduled_messages WHERE id = ?', [id]);
  }

  async getScheduledMessagesByStatus(status: string): Promise<ScheduledMessage[]> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM scheduled_messages WHERE status = ? ORDER BY created_at DESC',
      [status]
    );
    
    const messages = rows as any[];
    return messages.map(message => ({
      id: message.id,
      companyId: message.company_id,
      contactListId: message.contact_list_id,
      instanceIds: JSON.parse(message.instance_ids || '[]'),
      messageType: message.message_type,
      messageContent: message.message_content,
      messages: message.messages ? JSON.parse(message.messages) : null,
      useMultipleMessages: !!message.use_multiple_messages,
      fileName: message.file_name,
      fileBase64: message.file_base64,
      scheduledDateTime: this.formatDateTimeForLocal(message.scheduled_date_time),
      intervalMin: message.interval_min,
      intervalMax: message.interval_max,
      useMultipleInstances: !!message.use_multiple_instances,
      randomizeInstances: !!message.randomize_instances,
      status: message.status,
      totalMessages: message.total_messages,
      sentMessages: message.sent_messages,
      failedMessages: message.failed_messages,
      startedAt: message.started_at,
      completedAt: message.completed_at,
      errorMessage: message.error_message,
      createdAt: message.created_at,
      updatedAt: message.updated_at,
    }));
  }

  async getWhatsappInstancesByIds(ids: string[]): Promise<WhatsappInstance[]> {
    if (!this.connection) throw new Error('No database connection');
    
    if (ids.length === 0) return [];
    
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await this.connection.execute(
      `SELECT * FROM whatsapp_instances WHERE id IN (${placeholders})`,
      ids
    );
    
    const instances = rows as any[];
    console.log(`🔍 [Storage] Raw instances from DB:`, instances.map(i => ({ 
      id: i.id, 
      name: i.name, 
      evolution_id: i.evolution_id, 
      status: i.status 
    })));
    
    const mappedInstances = instances.map(instance => ({
      ...instance,
      companyId: instance.company_id,
      evolutionId: instance.evolution_instance_id,
      aiAgentId: instance.ai_agent_id,
      createdAt: instance.created_at,
      updatedAt: instance.updated_at
    }));
    
    console.log(`📋 [Storage] Mapped instances:`, mappedInstances.map(i => ({ 
      id: i.id, 
      name: i.name, 
      evolutionId: i.evolutionId, 
      status: i.status 
    })));
    
    return mappedInstances;
  }

  // Funnel Stages (Global - fixed for all companies)
  async getFunnelStage(id: string): Promise<FunnelStage | undefined> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM funnel_stages WHERE id = ?',
      [id]
    );

    const stages = rows as any[];
    if (stages.length === 0) return undefined;

    const stage = stages[0];
    return {
      ...stage,
      companyId: stage.company_id,
      isActive: Boolean(stage.is_active),
      isGlobal: Boolean(stage.is_global),
      createdAt: stage.created_at,
      updatedAt: stage.updated_at
    } as FunnelStage;
  }

  async getGlobalFunnelStages(): Promise<FunnelStage[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM funnel_stages WHERE is_global = TRUE AND is_active = TRUE ORDER BY `order` ASC'
    );

    const stages = rows as any[];
    return stages.map(stage => ({
      ...stage,
      companyId: stage.company_id,
      isActive: Boolean(stage.is_active),
      isGlobal: Boolean(stage.is_global),
      createdAt: stage.created_at,
      updatedAt: stage.updated_at
    })) as FunnelStage[];
  }

  async initializeGlobalFunnelStages(): Promise<void> {
    if (!this.connection) throw new Error('No database connection');

    // Check if global stages already exist
    const [rows] = await this.connection.execute(
      'SELECT COUNT(*) as count FROM funnel_stages WHERE is_global = TRUE'
    );
    const count = (rows as any[])[0].count;

    if (count > 0) {
      console.log('✅ Global funnel stages already initialized');
      return;
    }

    console.log('🔧 Initializing global funnel stages...');

    // Default global funnel stages for real estate
    const defaultStages = [
      { name: 'Novo Lead', description: 'Lead recém captado', color: '#3B82F6', order: 1 },
      { name: 'Primeiro Contato', description: 'Primeiro contato realizado', color: '#10B981', order: 2 },
      { name: 'Qualificação', description: 'Lead em processo de qualificação', color: '#F59E0B', order: 3 },
      { name: 'Visita Agendada', description: 'Visita ao imóvel agendada', color: '#8B5CF6', order: 4 },
      { name: 'Proposta Enviada', description: 'Proposta comercial enviada', color: '#06B6D4', order: 5 },
      { name: 'Negociação', description: 'Em negociação de valores/condições', color: '#F97316', order: 6 },
      { name: 'Fechado - Ganho', description: 'Negócio fechado com sucesso', color: '#22C55E', order: 7 },
      { name: 'Fechado - Perdido', description: 'Negócio não concluído', color: '#EF4444', order: 8 },
    ];

    for (const stage of defaultStages) {
      const id = randomUUID();
      await this.connection.execute(
        'INSERT INTO funnel_stages (id, company_id, name, description, color, `order`, is_active, is_global) VALUES (?, NULL, ?, ?, ?, ?, TRUE, TRUE)',
        [id, stage.name, stage.description, stage.color, stage.order]
      );
    }

    console.log('✅ Global funnel stages initialized successfully');
  }

  // Customer methods
  async getCustomer(id: string): Promise<Customer | undefined> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM customers WHERE id = ?',
      [id]
    );
    
    const customers = rows as any[];
    if (customers.length === 0) return undefined;
    
    return this.parseCustomer(customers[0]);
  }

  async getCustomersByCompany(companyId: string): Promise<Customer[]> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM customers WHERE company_id = ? ORDER BY created_at DESC',
      [companyId]
    );
    
    const customers = rows as any[];
    return customers.map(row => this.parseCustomer(row));
  }

  async getCustomerByPhone(phone: string, companyId: string): Promise<Customer | undefined> {
    if (!this.connection) throw new Error('No database connection');
    
    const [rows] = await this.connection.execute(
      'SELECT * FROM customers WHERE phone = ? AND company_id = ?',
      [phone, companyId]
    );
    
    const customers = rows as any[];
    if (customers.length === 0) return undefined;
    
    return this.parseCustomer(customers[0]);
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    if (!this.connection) throw new Error('No database connection');
    
    const id = randomUUID();
    
    console.log('🔍 [STORAGE] Attempting to create customer:', {
      id,
      companyId: customer.companyId,
      name: customer.name,
      phone: customer.phone,
      funnelStageId: customer.funnelStageId,
      lastContact: customer.lastContact,
      source: customer.source,
      conversationId: customer.conversationId
    });
    
    try {
      await this.connection.execute(
        `INSERT INTO customers (id, company_id, name, phone, email, company, funnel_stage_id, last_contact, notes, value, source, conversation_id, interested_city_id, interested_property_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          customer.companyId,
          customer.name,
          customer.phone,
          customer.email || null,
          customer.company || null,
          customer.funnelStageId,
          customer.lastContact || null,
          customer.notes || null,
          customer.value || null,
          customer.source || 'WhatsApp',
          customer.conversationId || null,
          customer.interestedCityId || null,
          customer.interestedPropertyType || null
        ]
      );
      
      console.log('✅ [STORAGE] Customer insert successful, fetching created customer...');
      
      const newCustomer = await this.getCustomer(id);
      if (!newCustomer) {
        console.error('❌ [STORAGE] Customer was inserted but could not be retrieved');
        throw new Error('Failed to create customer');
      }
      
      console.log('✅ [STORAGE] Customer created successfully:', newCustomer.id);
      return newCustomer;
      
    } catch (error) {
      console.error('❌ [STORAGE] Error creating customer:', error);
      throw error;
    }
  }

  async updateCustomer(id: string, updates: Partial<Customer>): Promise<Customer> {
    if (!this.connection) throw new Error('No database connection');
    
    const fields = [];
    const values = [];
    
    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.phone !== undefined) {
      fields.push('phone = ?');
      values.push(updates.phone);
    }
    if (updates.email !== undefined) {
      fields.push('email = ?');
      values.push(updates.email);
    }
    if (updates.company !== undefined) {
      fields.push('company = ?');
      values.push(updates.company);
    }
    if (updates.funnelStageId !== undefined) {
      fields.push('funnel_stage_id = ?');
      values.push(updates.funnelStageId);
    }
    if (updates.lastContact !== undefined) {
      fields.push('last_contact = ?');
      values.push(updates.lastContact);
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes);
    }
    if (updates.value !== undefined) {
      fields.push('value = ?');
      values.push(updates.value);
    }
    if (updates.source !== undefined) {
      fields.push('source = ?');
      values.push(updates.source);
    }
    if (updates.conversationId !== undefined) {
      fields.push('conversation_id = ?');
      values.push(updates.conversationId);
    }
    if (updates.interestedCityId !== undefined) {
      fields.push('interested_city_id = ?');
      values.push(updates.interestedCityId);
    }
    if (updates.interestedPropertyType !== undefined) {
      fields.push('interested_property_type = ?');
      values.push(updates.interestedPropertyType);
    }
    if ((updates as any).interestedTransactionType !== undefined) {
      fields.push('interested_transaction_type = ?');
      values.push((updates as any).interestedTransactionType);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);

    await this.connection.execute(
      `UPDATE customers SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
      values
    );

    const updatedCustomer = await this.getCustomer(id);
    if (!updatedCustomer) throw new Error('Customer not found after update');

    return updatedCustomer;
  }

  async deleteCustomer(id: string): Promise<void> {
    if (!this.connection) throw new Error('No database connection');
    
    await this.connection.execute('DELETE FROM customers WHERE id = ?', [id]);
  }

  private parseCustomer(row: any): Customer {
    return {
      id: row.id,
      companyId: row.company_id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      company: row.company,
      funnelStageId: row.funnel_stage_id,
      lastContact: row.last_contact,
      notes: row.notes,
      value: row.value ? parseFloat(row.value) : undefined,
      source: row.source,
      conversationId: row.conversation_id,
      interestedCityId: row.interested_city_id,
      interestedPropertyType: row.interested_property_type,
      interestedTransactionType: row.interested_transaction_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // Lead methods
  async getLead(id: string): Promise<Lead | undefined> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM leads WHERE id = ?',
      [id]
    );

    const leads = rows as any[];
    if (leads.length === 0) return undefined;

    return this.parseLead(leads[0]);
  }

  async getLeadsByCompany(companyId: string): Promise<Lead[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM leads WHERE company_id = ? ORDER BY created_at DESC',
      [companyId]
    );

    const leads = rows as any[];
    return leads.map(row => this.parseLead(row));
  }

  async getLeadByPhone(phone: string, companyId: string): Promise<Lead | undefined> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM leads WHERE phone = ? AND company_id = ?',
      [phone, companyId]
    );

    const leads = rows as any[];
    if (leads.length === 0) return undefined;

    return this.parseLead(leads[0]);
  }

  async createLead(lead: InsertLead): Promise<Lead> {
    if (!this.connection) throw new Error('No database connection');

    const id = randomUUID();

    await this.connection.execute(
      `INSERT INTO leads (
        id, company_id, name, phone, email, source, status, notes,
        interested_city_id, interested_property_type, interested_transaction_type,
        converted_to_customer, customer_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        id,
        lead.companyId,
        lead.name,
        lead.phone,
        lead.email || null,
        lead.source || 'Manual',
        lead.status || 'new',
        lead.notes || null,
        lead.interestedCityId || null,
        lead.interestedPropertyType || null,
        lead.interestedTransactionType || null,
        lead.convertedToCustomer || false,
        lead.customerId || null
      ]
    );

    const newLead = await this.getLead(id);
    if (!newLead) {
      throw new Error('Failed to create lead');
    }

    return newLead;
  }

  async updateLead(id: string, updates: Partial<Lead>): Promise<Lead> {
    if (!this.connection) throw new Error('No database connection');

    const setClause = [];
    const values = [];

    if (updates.name !== undefined) {
      setClause.push('name = ?');
      values.push(updates.name);
    }
    if (updates.phone !== undefined) {
      setClause.push('phone = ?');
      values.push(updates.phone);
    }
    if (updates.email !== undefined) {
      setClause.push('email = ?');
      values.push(updates.email);
    }
    if (updates.source !== undefined) {
      setClause.push('source = ?');
      values.push(updates.source);
    }
    if (updates.status !== undefined) {
      setClause.push('status = ?');
      values.push(updates.status);
    }
    if (updates.notes !== undefined) {
      setClause.push('notes = ?');
      values.push(updates.notes);
    }
    if (updates.convertedToCustomer !== undefined) {
      setClause.push('converted_to_customer = ?');
      values.push(updates.convertedToCustomer);
    }
    if (updates.customerId !== undefined) {
      setClause.push('customer_id = ?');
      values.push(updates.customerId);
    }
    if (updates.interestedCityId !== undefined) {
      setClause.push('interested_city_id = ?');
      values.push(updates.interestedCityId);
    }
    if (updates.interestedPropertyType !== undefined) {
      setClause.push('interested_property_type = ?');
      values.push(updates.interestedPropertyType);
    }
    if ((updates as any).interestedTransactionType !== undefined) {
      setClause.push('interested_transaction_type = ?');
      values.push((updates as any).interestedTransactionType);
    }

    setClause.push('updated_at = NOW()');
    values.push(id);

    await this.connection.execute(
      `UPDATE leads SET ${setClause.join(', ')} WHERE id = ?`,
      values
    );

    const updatedLead = await this.getLead(id);
    if (!updatedLead) {
      throw new Error('Lead not found after update');
    }

    return updatedLead;
  }

  async deleteLead(id: string): Promise<void> {
    if (!this.connection) throw new Error('No database connection');

    await this.connection.execute('DELETE FROM leads WHERE id = ?', [id]);
  }

  private parseLead(row: any): Lead {
    return {
      id: row.id,
      companyId: row.company_id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      source: row.source,
      status: row.status,
      notes: row.notes,
      interestedCityId: row.interested_city_id,
      interestedPropertyType: row.interested_property_type,
      interestedTransactionType: row.interested_transaction_type,
      convertedToCustomer: row.converted_to_customer,
      customerId: row.customer_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // Property methods
  async getProperty(id: string): Promise<Property | undefined> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM properties WHERE id = ?',
      [id]
    ) as [any[], mysql.FieldPacket[]];

    return rows.length > 0 ? this.parseProperty(rows[0]) : undefined;
  }

  async getPropertyByCode(code: string, companyId: string): Promise<Property | undefined> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM properties WHERE code = ? AND company_id = ?',
      [code, companyId]
    ) as [any[], mysql.FieldPacket[]];

    return rows.length > 0 ? this.parseProperty(rows[0]) : undefined;
  }

  async getPropertiesByCompany(companyId: string): Promise<Property[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM properties WHERE company_id = ? ORDER BY created_at DESC',
      [companyId]
    ) as [any[], mysql.FieldPacket[]];

    return rows.map(row => this.parseProperty(row));
  }

  async searchProperties(companyId: string, filters: {
    city?: string;
    transactionType?: string;
    propertyType?: string;
  }): Promise<Property[]> {
    if (!this.connection) throw new Error('No database connection');

    console.log('🔍 [SEARCH_PROPERTIES] ========== INÍCIO DA BUSCA ==========');
    console.log('🔍 [SEARCH_PROPERTIES] CompanyId:', companyId);
    console.log('🔍 [SEARCH_PROPERTIES] Filtros recebidos:', JSON.stringify(filters, null, 2));
    console.log('🔍 [SEARCH_PROPERTIES] filters.propertyType:', filters.propertyType, '(type:', typeof filters.propertyType, ')');
    console.log('🔍 [SEARCH_PROPERTIES] filters.propertyType is undefined?', filters.propertyType === undefined);
    console.log('🔍 [SEARCH_PROPERTIES] filters.propertyType is null?', filters.propertyType === null);
    console.log('🔍 [SEARCH_PROPERTIES] filters.propertyType is empty string?', filters.propertyType === '');

    let query = 'SELECT * FROM properties WHERE company_id = ? AND status = ?';
    const params: any[] = [companyId, 'active'];

    if (filters.city) {
      query += ' AND city = ?';
      params.push(filters.city);
      console.log('🔍 [SEARCH_PROPERTIES] Adicionando filtro de cidade:', filters.city);
    }

    if (filters.transactionType) {
      query += ' AND transaction_type = ?';
      params.push(filters.transactionType);
      console.log('🔍 [SEARCH_PROPERTIES] Adicionando filtro de transação:', filters.transactionType);
    }

    if (filters.propertyType) {
      // Busca APENAS no campo property_type (já populamos todos os imóveis)
      // Converter para lowercase para comparação case-insensitive
      query += ' AND LOWER(property_type) = LOWER(?)';
      params.push(filters.propertyType);
      console.log('🔍 [SEARCH_PROPERTIES] Adicionando filtro de tipo de imóvel:', filters.propertyType);
    } else {
      console.log('⚠️ [SEARCH_PROPERTIES] ATENÇÃO: propertyType NÃO foi fornecido! Filtro de tipo NÃO será aplicado!');
    }

    query += ' ORDER BY created_at DESC';

    console.log('🔍 [SEARCH_PROPERTIES] SQL Query Final:', query);
    console.log('🔍 [SEARCH_PROPERTIES] Parameters Final:', params);

    const [rows] = await this.connection.execute(query, params) as [any[], mysql.FieldPacket[]];

    console.log(`🔍 [SEARCH_PROPERTIES] Found ${rows.length} properties`);
    if (rows.length > 0) {
      console.log('🔍 [SEARCH_PROPERTIES] First 5 results (RAW from DB):');
      rows.slice(0, 5).forEach((r: any, idx: number) => {
        console.log(`  [${idx + 1}] code: ${r.code}, name: ${r.name}, property_type: "${r.property_type}", transaction_type: "${r.transaction_type}"`);
      });
    }

    const parsedProperties = rows.map(row => this.parseProperty(row));

    console.log('🔍 [SEARCH_PROPERTIES] Parsed properties (first 3):');
    parsedProperties.slice(0, 3).forEach((p: any, idx: number) => {
      console.log(`  [${idx + 1}] code: ${p.code}, name: ${p.name}, propertyType: "${p.propertyType}"`);
    });
    console.log('🔍 [SEARCH_PROPERTIES] ========== FIM DA BUSCA ==========');

    return parsedProperties;
  }

  async createProperty(property: InsertProperty): Promise<Property> {
    if (!this.connection) throw new Error('No database connection');

    const id = randomUUID();

    await this.connection.execute(`
      INSERT INTO properties (id, company_id, code, name, property_type, street, number, proximity,
        neighborhood, city, state, zip_code, private_area, parking_spaces, bathrooms,
        bedrooms, description, map_location, transaction_type, status, images, youtube_video_url, amenities, price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, property.companyId, property.code, property.name, property.propertyType || null, property.street,
      property.number, property.proximity || null, property.neighborhood || null, property.city || null,
      property.state || null, property.zipCode || null, property.privateArea, property.parkingSpaces || 0,
      property.bathrooms || 1, property.bedrooms || 0, property.description || null, property.mapLocation || null,
      property.transactionType || 'venda', property.status || 'active',
      JSON.stringify((property as any).images || []),
      (property as any).youtubeVideoUrl || null,
      JSON.stringify((property as any).amenities || []),
      property.price || null
    ]);

    const newProperty = await this.getProperty(id);
    if (!newProperty) throw new Error('Failed to create property');

    return newProperty;
  }

  async updateProperty(id: string, updates: Partial<Property>): Promise<Property> {
    if (!this.connection) throw new Error('No database connection');
    
    const fields = [];
    const values = [];
    
    if (updates.code !== undefined) {
      fields.push('code = ?');
      values.push(updates.code);
    }
    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.propertyType !== undefined) {
      fields.push('property_type = ?');
      values.push(updates.propertyType);
    }
    if (updates.street !== undefined) {
      fields.push('street = ?');
      values.push(updates.street);
    }
    if (updates.number !== undefined) {
      fields.push('number = ?');
      values.push(updates.number);
    }
    if (updates.proximity !== undefined) {
      fields.push('proximity = ?');
      values.push(updates.proximity);
    }
    if (updates.neighborhood !== undefined) {
      fields.push('neighborhood = ?');
      values.push(updates.neighborhood);
    }
    if (updates.city !== undefined) {
      fields.push('city = ?');
      values.push(updates.city);
    }
    if (updates.state !== undefined) {
      fields.push('state = ?');
      values.push(updates.state);
    }
    if (updates.zipCode !== undefined) {
      fields.push('zip_code = ?');
      values.push(updates.zipCode);
    }
    if (updates.privateArea !== undefined) {
      fields.push('private_area = ?');
      values.push(updates.privateArea);
    }
    if (updates.parkingSpaces !== undefined) {
      fields.push('parking_spaces = ?');
      values.push(updates.parkingSpaces);
    }
    if (updates.bathrooms !== undefined) {
      fields.push('bathrooms = ?');
      values.push(updates.bathrooms);
    }
    if (updates.bedrooms !== undefined) {
      fields.push('bedrooms = ?');
      values.push(updates.bedrooms);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.mapLocation !== undefined) {
      fields.push('map_location = ?');
      values.push(updates.mapLocation);
    }
    if (updates.transactionType !== undefined) {
      fields.push('transaction_type = ?');
      values.push(updates.transactionType);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.images !== undefined) {
      fields.push('images = ?');
      values.push(JSON.stringify(updates.images));
    }
    if (updates.youtubeVideoUrl !== undefined) {
      fields.push('youtube_video_url = ?');
      values.push(updates.youtubeVideoUrl);
    }
    if (updates.amenities !== undefined) {
      fields.push('amenities = ?');
      values.push(JSON.stringify(updates.amenities));
    }
    if (updates.featured !== undefined) {
      fields.push('featured = ?');
      values.push(updates.featured);
    }
    if (updates.price !== undefined) {
      fields.push('price = ?');
      values.push(updates.price);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);
    
    await this.connection.execute(
      `UPDATE properties SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );
    
    const updatedProperty = await this.getProperty(id);
    if (!updatedProperty) throw new Error('Property not found after update');
    
    return updatedProperty;
  }

  async deleteProperty(id: string): Promise<void> {
    if (!this.connection) throw new Error('No database connection');

    await this.connection.execute('DELETE FROM properties WHERE id = ?', [id]);
  }

  // Amenities (Comodidades) methods
  async getAmenity(id: string): Promise<Amenity | undefined> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM amenities WHERE id = ?',
      [id]
    );

    if ((rows as any[]).length === 0) return undefined;

    return this.parseAmenity((rows as any[])[0]);
  }

  async getAmenitiesByCompany(companyId: string): Promise<Amenity[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM amenities WHERE company_id = ? ORDER BY name ASC',
      [companyId]
    );

    return (rows as any[]).map(row => this.parseAmenity(row));
  }

  async createAmenity(amenity: InsertAmenity): Promise<Amenity> {
    if (!this.connection) throw new Error('No database connection');

    const id = randomUUID();

    await this.connection.execute(
      'INSERT INTO amenities (id, company_id, name, icon, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [id, amenity.companyId, amenity.name, amenity.icon]
    );

    const newAmenity = await this.getAmenity(id);
    if (!newAmenity) throw new Error('Failed to create amenity');

    return newAmenity;
  }

  async updateAmenity(id: string, updates: Partial<Amenity>): Promise<Amenity> {
    if (!this.connection) throw new Error('No database connection');

    const fields = [];
    const values = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }

    if (updates.icon !== undefined) {
      fields.push('icon = ?');
      values.push(updates.icon);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    const query = `UPDATE amenities SET ${fields.join(', ')} WHERE id = ?`;
    await this.connection.execute(query, values);

    const updatedAmenity = await this.getAmenity(id);
    if (!updatedAmenity) throw new Error('Amenity not found after update');

    return updatedAmenity;
  }

  async deleteAmenity(id: string): Promise<void> {
    if (!this.connection) throw new Error('No database connection');

    await this.connection.execute('DELETE FROM amenities WHERE id = ?', [id]);
  }

  private parseAmenity(row: any): Amenity {
    return {
      id: row.id,
      companyId: row.company_id,
      name: row.name,
      icon: row.icon,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // Cities (Cidades) methods
  async getCity(id: string): Promise<City | undefined> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM cities WHERE id = ?',
      [id]
    );

    if ((rows as any[]).length === 0) return undefined;

    return this.parseCity((rows as any[])[0]);
  }

  async getCitiesByCompany(companyId: string): Promise<City[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM cities WHERE company_id = ? ORDER BY name ASC',
      [companyId]
    );

    return (rows as any[]).map(row => this.parseCity(row));
  }

  async getCityByName(name: string, companyId: string): Promise<City | undefined> {
    if (!this.connection) throw new Error('No database connection');

    // Busca case-insensitive
    const [rows] = await this.connection.execute(
      'SELECT * FROM cities WHERE LOWER(name) LIKE LOWER(?) AND company_id = ? LIMIT 1',
      [`%${name}%`, companyId]
    );

    const cities = rows as any[];
    if (cities.length === 0) return undefined;

    return this.parseCity(cities[0]);
  }

  async createCity(city: InsertCity): Promise<City> {
    if (!this.connection) throw new Error('No database connection');

    const id = randomUUID();

    await this.connection.execute(
      'INSERT INTO cities (id, company_id, name, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
      [id, city.companyId, city.name]
    );

    const newCity = await this.getCity(id);
    if (!newCity) throw new Error('Failed to create city');

    return newCity;
  }

  async updateCity(id: string, updates: Partial<City>): Promise<City> {
    if (!this.connection) throw new Error('No database connection');

    const fields = [];
    const values = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    const query = `UPDATE cities SET ${fields.join(', ')} WHERE id = ?`;
    await this.connection.execute(query, values);

    const updatedCity = await this.getCity(id);
    if (!updatedCity) throw new Error('City not found after update');

    return updatedCity;
  }

  async deleteCity(id: string): Promise<void> {
    if (!this.connection) throw new Error('No database connection');

    await this.connection.execute('DELETE FROM cities WHERE id = ?', [id]);
  }

  private parseCity(row: any): City {
    return {
      id: row.id,
      companyId: row.company_id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private parseProperty(row: any): Property {
    return {
      id: row.id,
      companyId: row.company_id,
      code: row.code,
      name: row.name,
      propertyType: row.property_type ? row.property_type.toLowerCase() : "N/A", // Manter "N/A" para valores NULL
      street: row.street,
      number: row.number,
      proximity: row.proximity || "",
      neighborhood: row.neighborhood || "",
      city: row.city || "",
      state: row.state || "",
      zipCode: row.zip_code || "",
      privateArea: parseFloat(row.private_area?.toString() || '0') as number,
      parkingSpaces: row.parking_spaces || 0,
      bathrooms: row.bathrooms || 1,
      bedrooms: row.bedrooms || 0,
      description: row.description || "",
      mapLocation: row.map_location || "",
      transactionType: row.transaction_type || "venda",
      status: row.status,
      images: row.images ? (typeof row.images === 'string' ? JSON.parse(row.images) : row.images) : [],
      youtubeVideoUrl: row.youtube_video_url || "",
      amenities: row.amenities ? (typeof row.amenities === 'string' ? JSON.parse(row.amenities) : row.amenities) : [],
      featured: row.featured || false,
      price: row.price ? row.price.toString() : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ============ Custom Domains Methods ============

  async getCustomDomain(id: string): Promise<CompanyCustomDomain | undefined> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM company_custom_domains WHERE id = ?',
      [id]
    );

    const results = rows as any[];
    if (results.length === 0) return undefined;

    return this.mapCustomDomainRow(results[0]);
  }

  async getCustomDomainByHost(host: string): Promise<CompanyCustomDomain | undefined> {
    if (!this.connection) throw new Error('No database connection');

    // Remove www. prefix if exists
    const cleanHost = host.replace(/^www\./, '');

    const [rows] = await this.connection.execute(
      'SELECT * FROM company_custom_domains WHERE requested_domain = ? AND status = 1',
      [cleanHost]
    );

    const results = rows as any[];
    if (results.length === 0) return undefined;

    return this.mapCustomDomainRow(results[0]);
  }

  async getCustomDomainsByCompany(companyId: string): Promise<CompanyCustomDomain[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM company_custom_domains WHERE company_id = ? ORDER BY created_at DESC',
      [companyId]
    );

    return (rows as any[]).map(row => this.mapCustomDomainRow(row));
  }

  async getLatestCustomDomainByCompany(companyId: string): Promise<CompanyCustomDomain | undefined> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM company_custom_domains WHERE company_id = ? AND status != 2 ORDER BY id DESC LIMIT 1',
      [companyId]
    );

    const results = rows as any[];
    if (results.length === 0) return undefined;

    return this.mapCustomDomainRow(results[0]);
  }

  async getAllCustomDomains(): Promise<CompanyCustomDomain[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM company_custom_domains ORDER BY created_at DESC'
    );

    return (rows as any[]).map(row => this.mapCustomDomainRow(row));
  }

  async getCustomDomainsByStatus(status: number): Promise<CompanyCustomDomain[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM company_custom_domains WHERE status = ? ORDER BY created_at DESC',
      [status]
    );

    return (rows as any[]).map(row => this.mapCustomDomainRow(row));
  }

  async createCustomDomain(domain: InsertCompanyCustomDomain): Promise<CompanyCustomDomain> {
    if (!this.connection) throw new Error('No database connection');

    const id = randomUUID();

    await this.connection.execute(
      `INSERT INTO company_custom_domains
       (id, company_id, requested_domain, current_domain, status)
       VALUES (?, ?, ?, ?, ?)`,
      [id, domain.companyId, domain.requestedDomain, domain.currentDomain, domain.status || 0]
    );

    const created = await this.getCustomDomain(id);
    if (!created) throw new Error('Failed to create custom domain');

    return created;
  }

  async updateCustomDomain(id: string, updates: Partial<CompanyCustomDomain>): Promise<CompanyCustomDomain> {
    if (!this.connection) throw new Error('No database connection');

    const fields = [];
    const values = [];

    if (updates.requestedDomain !== undefined) {
      fields.push('requested_domain = ?');
      values.push(updates.requestedDomain);
    }
    if (updates.currentDomain !== undefined) {
      fields.push('current_domain = ?');
      values.push(updates.currentDomain);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }

    if (fields.length === 0) {
      const existing = await this.getCustomDomain(id);
      if (!existing) throw new Error('Custom domain not found');
      return existing;
    }

    values.push(id);

    await this.connection.execute(
      `UPDATE company_custom_domains SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    const updated = await this.getCustomDomain(id);
    if (!updated) throw new Error('Failed to update custom domain');

    return updated;
  }

  async deleteCustomDomain(id: string): Promise<void> {
    if (!this.connection) throw new Error('No database connection');

    await this.connection.execute(
      'DELETE FROM company_custom_domains WHERE id = ?',
      [id]
    );
  }

  private mapCustomDomainRow(row: any): CompanyCustomDomain {
    return {
      id: row.id,
      companyId: row.company_id,
      requestedDomain: row.requested_domain,
      currentDomain: row.current_domain,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ============================================
  // WEBSITE TEMPLATES METHODS
  // ============================================

  async getAllWebsiteTemplates(): Promise<WebsiteTemplate[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM website_templates ORDER BY category, name'
    );

    return (rows as any[]).map(this.mapWebsiteTemplateRow);
  }

  async getWebsiteTemplate(id: string): Promise<WebsiteTemplate | undefined> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM website_templates WHERE id = ?',
      [id]
    );

    const templates = rows as any[];
    return templates.length > 0 ? this.mapWebsiteTemplateRow(templates[0]) : undefined;
  }

  private mapWebsiteTemplateRow(row: any): WebsiteTemplate {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      thumbnail: row.thumbnail,
      category: row.category,
      features: typeof row.features === 'string' ? JSON.parse(row.features) : row.features,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ============================================
  // COMPANY WEBSITES METHODS
  // ============================================

  async getCompanyWebsite(companyId: string): Promise<CompanyWebsite | undefined> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM company_websites WHERE company_id = ? AND is_active = TRUE ORDER BY created_at DESC LIMIT 1',
      [companyId]
    );

    const websites = rows as any[];
    return websites.length > 0 ? this.mapCompanyWebsiteRow(websites[0]) : undefined;
  }

  async createCompanyWebsite(website: InsertCompanyWebsite): Promise<CompanyWebsite> {
    if (!this.connection) throw new Error('No database connection');

    // Desativar websites anteriores da mesma empresa
    await this.connection.execute(
      'UPDATE company_websites SET is_active = FALSE WHERE company_id = ?',
      [website.companyId]
    );

    // Criar novo website
    const id = randomUUID();
    await this.connection.execute(
      `INSERT INTO company_websites (id, company_id, template_id, config, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [id, website.companyId, website.templateId, JSON.stringify(website.config), website.isActive ?? true]
    );

    const created = await this.getCompanyWebsite(website.companyId);
    if (!created) throw new Error('Failed to create company website');
    return created;
  }

  async updateCompanyWebsite(id: string, updates: Partial<CompanyWebsite>): Promise<CompanyWebsite> {
    if (!this.connection) throw new Error('No database connection');

    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.templateId !== undefined) {
      setClauses.push('template_id = ?');
      values.push(updates.templateId);
    }
    if (updates.config !== undefined) {
      setClauses.push('config = ?');
      values.push(JSON.stringify(updates.config));
    }
    if (updates.isActive !== undefined) {
      setClauses.push('is_active = ?');
      values.push(updates.isActive);
    }

    if (setClauses.length === 0) {
      throw new Error('No fields to update');
    }

    setClauses.push('updated_at = NOW()');
    values.push(id);

    await this.connection.execute(
      `UPDATE company_websites SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    const [rows] = await this.connection.execute(
      'SELECT * FROM company_websites WHERE id = ?',
      [id]
    );

    const websites = rows as any[];
    if (websites.length === 0) throw new Error('Company website not found');
    return this.mapCompanyWebsiteRow(websites[0]);
  }

  private mapCompanyWebsiteRow(row: any): CompanyWebsite {
    return {
      id: row.id,
      companyId: row.company_id,
      templateId: row.template_id,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ============================================
  // COMPANY AGENTS METHODS
  // ============================================

  async getCompanyAgent(id: string): Promise<CompanyAgent | undefined> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM company_agents WHERE id = ?',
      [id]
    );

    const agents = rows as any[];
    return agents.length > 0 ? this.mapCompanyAgentRow(agents[0]) : undefined;
  }

  async getCompanyAgentsByCompany(companyId: string): Promise<CompanyAgent[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM company_agents WHERE company_id = ? ORDER BY created_at DESC',
      [companyId]
    );

    return (rows as any[]).map(this.mapCompanyAgentRow);
  }

  async getActiveCompanyAgents(companyId: string): Promise<CompanyAgent[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM company_agents WHERE company_id = ? AND is_active = TRUE ORDER BY properties_sold DESC, name ASC',
      [companyId]
    );

    return (rows as any[]).map(this.mapCompanyAgentRow);
  }

  async createCompanyAgent(agent: InsertCompanyAgent): Promise<CompanyAgent> {
    if (!this.connection) throw new Error('No database connection');

    const id = randomUUID();
    await this.connection.execute(
      `INSERT INTO company_agents (id, company_id, name, email, phone, avatar, role, bio, social_media, properties_sold, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        id,
        agent.companyId,
        agent.name,
        agent.email || null,
        agent.phone || null,
        agent.avatar || null,
        agent.role || null,
        agent.bio || null,
        agent.socialMedia ? JSON.stringify(agent.socialMedia) : null,
        agent.propertiesSold || 0,
        agent.isActive ?? true
      ]
    );

    const created = await this.getCompanyAgent(id);
    if (!created) throw new Error('Failed to create company agent');
    return created;
  }

  async updateCompanyAgent(id: string, updates: Partial<CompanyAgent>): Promise<CompanyAgent> {
    if (!this.connection) throw new Error('No database connection');

    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.email !== undefined) {
      setClauses.push('email = ?');
      values.push(updates.email);
    }
    if (updates.phone !== undefined) {
      setClauses.push('phone = ?');
      values.push(updates.phone);
    }
    if (updates.avatar !== undefined) {
      setClauses.push('avatar = ?');
      values.push(updates.avatar);
    }
    if (updates.role !== undefined) {
      setClauses.push('role = ?');
      values.push(updates.role);
    }
    if (updates.bio !== undefined) {
      setClauses.push('bio = ?');
      values.push(updates.bio);
    }
    if (updates.socialMedia !== undefined) {
      setClauses.push('social_media = ?');
      values.push(JSON.stringify(updates.socialMedia));
    }
    if (updates.propertiesSold !== undefined) {
      setClauses.push('properties_sold = ?');
      values.push(updates.propertiesSold);
    }
    if (updates.isActive !== undefined) {
      setClauses.push('is_active = ?');
      values.push(updates.isActive);
    }

    if (setClauses.length === 0) {
      throw new Error('No fields to update');
    }

    setClauses.push('updated_at = NOW()');
    values.push(id);

    await this.connection.execute(
      `UPDATE company_agents SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    const updated = await this.getCompanyAgent(id);
    if (!updated) throw new Error('Company agent not found');
    return updated;
  }

  async deleteCompanyAgent(id: string): Promise<void> {
    if (!this.connection) throw new Error('No database connection');

    await this.connection.execute(
      'DELETE FROM company_agents WHERE id = ?',
      [id]
    );
  }

  private mapCompanyAgentRow(row: any): CompanyAgent {
    return {
      id: row.id,
      companyId: row.company_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      avatar: row.avatar,
      role: row.role,
      bio: row.bio,
      socialMedia: row.social_media,
      propertiesSold: row.properties_sold,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ============================================
  // COMPANY TESTIMONIALS METHODS
  // ============================================

  async getCompanyTestimonial(id: string): Promise<CompanyTestimonial | undefined> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM company_testimonials WHERE id = ?',
      [id]
    );

    const testimonials = rows as any[];
    return testimonials.length > 0 ? this.mapCompanyTestimonialRow(testimonials[0]) : undefined;
  }

  async getCompanyTestimonialsByCompany(companyId: string): Promise<CompanyTestimonial[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM company_testimonials WHERE company_id = ? ORDER BY created_at DESC',
      [companyId]
    );

    return (rows as any[]).map(this.mapCompanyTestimonialRow);
  }

  async getActiveCompanyTestimonials(companyId: string): Promise<CompanyTestimonial[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM company_testimonials WHERE company_id = ? AND is_active = TRUE ORDER BY rating DESC, created_at DESC',
      [companyId]
    );

    return (rows as any[]).map(this.mapCompanyTestimonialRow);
  }

  async createCompanyTestimonial(testimonial: InsertCompanyTestimonial): Promise<CompanyTestimonial> {
    if (!this.connection) throw new Error('No database connection');

    const id = randomUUID();
    await this.connection.execute(
      `INSERT INTO company_testimonials (id, company_id, client_name, client_avatar, rating, comment, property_type, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        id,
        testimonial.companyId,
        testimonial.clientName,
        testimonial.clientAvatar || null,
        testimonial.rating || 5,
        testimonial.comment,
        testimonial.propertyType || null,
        testimonial.isActive ?? true
      ]
    );

    const created = await this.getCompanyTestimonial(id);
    if (!created) throw new Error('Failed to create company testimonial');
    return created;
  }

  async updateCompanyTestimonial(id: string, updates: Partial<CompanyTestimonial>): Promise<CompanyTestimonial> {
    if (!this.connection) throw new Error('No database connection');

    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.clientName !== undefined) {
      setClauses.push('client_name = ?');
      values.push(updates.clientName);
    }
    if (updates.clientAvatar !== undefined) {
      setClauses.push('client_avatar = ?');
      values.push(updates.clientAvatar);
    }
    if (updates.rating !== undefined) {
      setClauses.push('rating = ?');
      values.push(updates.rating);
    }
    if (updates.comment !== undefined) {
      setClauses.push('comment = ?');
      values.push(updates.comment);
    }
    if (updates.propertyType !== undefined) {
      setClauses.push('property_type = ?');
      values.push(updates.propertyType);
    }
    if (updates.isActive !== undefined) {
      setClauses.push('is_active = ?');
      values.push(updates.isActive);
    }

    if (setClauses.length === 0) {
      throw new Error('No fields to update');
    }

    setClauses.push('updated_at = NOW()');
    values.push(id);

    await this.connection.execute(
      `UPDATE company_testimonials SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    const updated = await this.getCompanyTestimonial(id);
    if (!updated) throw new Error('Company testimonial not found');
    return updated;
  }

  async deleteCompanyTestimonial(id: string): Promise<void> {
    if (!this.connection) throw new Error('No database connection');

    await this.connection.execute(
      'DELETE FROM company_testimonials WHERE id = ?',
      [id]
    );
  }

  private mapCompanyTestimonialRow(row: any): CompanyTestimonial {
    return {
      id: row.id,
      companyId: row.company_id,
      clientName: row.client_name,
      clientAvatar: row.client_avatar,
      rating: row.rating,
      comment: row.comment,
      propertyType: row.property_type,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ============================================
  // PLANS METHODS
  // ============================================

  async getPlan(id: string): Promise<Plan | undefined> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM plans WHERE id = ?',
      [id]
    );

    const plans = rows as any[];
    return plans.length > 0 ? this.mapPlanRow(plans[0]) : undefined;
  }

  async getAllPlans(): Promise<Plan[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM plans ORDER BY created_at DESC'
    );

    return (rows as any[]).map(row => this.mapPlanRow(row));
  }

  async createPlan(plan: InsertPlan): Promise<Plan> {
    if (!this.connection) throw new Error('No database connection');

    const id = randomUUID();
    await this.connection.execute(
      'INSERT INTO plans (id, name, price, agent_limit, is_active) VALUES (?, ?, ?, ?, ?)',
      [id, plan.name, plan.price, plan.agentLimit || 1, plan.isActive ?? true]
    );

    const created = await this.getPlan(id);
    if (!created) throw new Error('Failed to create plan');
    return created;
  }

  async updatePlan(id: string, updates: Partial<Plan>): Promise<Plan> {
    if (!this.connection) throw new Error('No database connection');

    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.price !== undefined) {
      setClauses.push('price = ?');
      values.push(updates.price);
    }
    if (updates.agentLimit !== undefined) {
      setClauses.push('agent_limit = ?');
      values.push(updates.agentLimit);
    }
    if (updates.isActive !== undefined) {
      setClauses.push('is_active = ?');
      values.push(updates.isActive);
    }

    if (setClauses.length === 0) {
      throw new Error('No fields to update');
    }

    setClauses.push('updated_at = NOW()');
    values.push(id);

    await this.connection.execute(
      `UPDATE plans SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    const updated = await this.getPlan(id);
    if (!updated) throw new Error('Plan not found');
    return updated;
  }

  async deletePlan(id: string): Promise<void> {
    if (!this.connection) throw new Error('No database connection');

    await this.connection.execute(
      'DELETE FROM plans WHERE id = ?',
      [id]
    );
  }

  // ============================================
  // BROKERS (CORRETORES) METHODS
  // ============================================

  async getBroker(id: string): Promise<Broker | undefined> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM brokers WHERE id = ?',
      [id]
    );

    const brokers = rows as any[];
    if (brokers.length === 0) return undefined;

    return this.mapBrokerRow(brokers[0]);
  }

  async getBrokersByCompany(companyId: string): Promise<Broker[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM brokers WHERE company_id = ? ORDER BY name',
      [companyId]
    );

    return (rows as any[]).map(row => this.mapBrokerRow(row));
  }

  async countBrokersByCompany(companyId: string): Promise<number> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT COUNT(*) as count FROM brokers WHERE company_id = ?',
      [companyId]
    );

    return (rows as any[])[0].count;
  }

  async createBroker(broker: InsertBroker): Promise<Broker> {
    if (!this.connection) throw new Error('No database connection');

    const id = randomUUID();
    await this.connection.execute(
      'INSERT INTO brokers (id, company_id, name, email, whatsapp) VALUES (?, ?, ?, ?, ?)',
      [id, broker.companyId, broker.name, broker.email || null, broker.whatsapp || null]
    );

    const created = await this.getBroker(id);
    if (!created) throw new Error('Failed to create broker');
    return created;
  }

  async updateBroker(id: string, updates: Partial<Broker>): Promise<Broker> {
    if (!this.connection) throw new Error('No database connection');

    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.email !== undefined) {
      setClauses.push('email = ?');
      values.push(updates.email);
    }
    if (updates.whatsapp !== undefined) {
      setClauses.push('whatsapp = ?');
      values.push(updates.whatsapp);
    }

    if (setClauses.length === 0) {
      throw new Error('No fields to update');
    }

    setClauses.push('updated_at = NOW()');
    values.push(id);

    await this.connection.execute(
      `UPDATE brokers SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    const updated = await this.getBroker(id);
    if (!updated) throw new Error('Broker not found');
    return updated;
  }

  async deleteBroker(id: string): Promise<void> {
    if (!this.connection) throw new Error('No database connection');

    await this.connection.execute(
      'DELETE FROM brokers WHERE id = ?',
      [id]
    );
  }

  private mapBrokerRow(row: any): Broker {
    return {
      id: row.id,
      companyId: row.company_id,
      name: row.name,
      email: row.email,
      whatsapp: row.whatsapp,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ========== APPOINTMENTS (AGENDAMENTOS) ==========

  async getAppointment(id: string): Promise<Appointment | undefined> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM appointments WHERE id = ?',
      [id]
    );

    const appointments = rows as any[];
    if (appointments.length === 0) return undefined;

    return this.mapAppointmentRow(appointments[0]);
  }

  async getAppointmentsByCompany(companyId: string): Promise<Appointment[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM appointments WHERE company_id = ? ORDER BY created_at DESC',
      [companyId]
    );

    return (rows as any[]).map(row => this.mapAppointmentRow(row));
  }

  async getAppointmentsByBroker(brokerId: string): Promise<Appointment[]> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM appointments WHERE broker_id = ? ORDER BY scheduled_date DESC',
      [brokerId]
    );

    return (rows as any[]).map(row => this.mapAppointmentRow(row));
  }

  // Busca o último agendamento do dia que tem corretor atribuído (para rodízio)
  async getLastAppointmentOfDayWithBroker(companyId: string): Promise<Appointment | undefined> {
    if (!this.connection) throw new Error('No database connection');

    // Buscar o último agendamento criado hoje que tenha um corretor atribuído
    const [rows] = await this.connection.execute(
      `SELECT * FROM appointments
       WHERE company_id = ?
       AND broker_id IS NOT NULL
       AND DATE(created_at) = CURDATE()
       ORDER BY created_at DESC
       LIMIT 1`,
      [companyId]
    );

    const appointments = rows as any[];
    if (appointments.length === 0) {
      return undefined;
    }

    return this.mapAppointmentRow(appointments[0]);
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    if (!this.connection) throw new Error('No database connection');

    const id = randomUUID();
    await this.connection.execute(
      `INSERT INTO appointments (id, company_id, broker_id, property_id, client_name, client_phone, property_interest, scheduled_date, status, notes, source, conversation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        appointment.companyId,
        appointment.brokerId || null,
        appointment.propertyId || null,
        appointment.clientName,
        appointment.clientPhone,
        appointment.propertyInterest || null,
        appointment.scheduledDate || null,
        appointment.status || 'pendente',
        appointment.notes || null,
        appointment.source || 'whatsapp',
        appointment.conversationId || null
      ]
    );

    const created = await this.getAppointment(id);
    if (!created) throw new Error('Failed to create appointment');
    return created;
  }

  async updateAppointment(id: string, updates: Partial<Appointment>): Promise<Appointment> {
    if (!this.connection) throw new Error('No database connection');

    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.brokerId !== undefined) {
      setClauses.push('broker_id = ?');
      values.push(updates.brokerId);
    }
    if (updates.propertyId !== undefined) {
      setClauses.push('property_id = ?');
      values.push(updates.propertyId);
    }
    if (updates.clientName !== undefined) {
      setClauses.push('client_name = ?');
      values.push(updates.clientName);
    }
    if (updates.clientPhone !== undefined) {
      setClauses.push('client_phone = ?');
      values.push(updates.clientPhone);
    }
    if (updates.propertyInterest !== undefined) {
      setClauses.push('property_interest = ?');
      values.push(updates.propertyInterest);
    }
    if (updates.scheduledDate !== undefined) {
      setClauses.push('scheduled_date = ?');
      values.push(updates.scheduledDate);
    }
    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      values.push(updates.status);
    }
    if (updates.notes !== undefined) {
      setClauses.push('notes = ?');
      values.push(updates.notes);
    }

    if (setClauses.length === 0) {
      throw new Error('No fields to update');
    }

    setClauses.push('updated_at = NOW()');
    values.push(id);

    await this.connection.execute(
      `UPDATE appointments SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    const updated = await this.getAppointment(id);
    if (!updated) throw new Error('Appointment not found');
    return updated;
  }

  async deleteAppointment(id: string): Promise<void> {
    if (!this.connection) throw new Error('No database connection');

    await this.connection.execute(
      'DELETE FROM appointments WHERE id = ?',
      [id]
    );
  }

  private mapAppointmentRow(row: any): Appointment {
    return {
      id: row.id,
      companyId: row.company_id,
      brokerId: row.broker_id,
      propertyId: row.property_id,
      clientName: row.client_name,
      clientPhone: row.client_phone,
      propertyInterest: row.property_interest,
      scheduledDate: row.scheduled_date,
      status: row.status,
      notes: row.notes,
      source: row.source,
      conversationId: row.conversation_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapPlanRow(row: any): Plan {
    return {
      id: row.id,
      name: row.name,
      price: row.price,
      agentLimit: row.agent_limit,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

let storageInstance: MySQLStorage | null = null;

export function getStorage(): MySQLStorage {
  if (!storageInstance) {
    storageInstance = new MySQLStorage();
  }
  return storageInstance;
}
