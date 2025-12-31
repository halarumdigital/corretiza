import { sql } from "drizzle-orm";
import { mysqlTable, varchar, text, json, timestamp, int, boolean, decimal } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: text("password").notNull(),
  role: varchar("role", { length: 20 }).notNull().default("client"), // 'admin' | 'client'
  companyId: varchar("company_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const companies = mysqlTable("companies", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  cnpj: varchar("cnpj", { length: 18 }),
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  cep: varchar("cep", { length: 10 }),
  avatar: text("avatar"), // Object storage path
  responsibleName: varchar("responsible_name", { length: 255 }),
  responsiblePhone: varchar("responsible_phone", { length: 20 }),
  responsibleEmail: varchar("responsible_email", { length: 255 }),
  planId: varchar("plan_id", { length: 36 }),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const companyCustomDomains = mysqlTable("company_custom_domains", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  requestedDomain: varchar("requested_domain", { length: 255 }),
  currentDomain: varchar("current_domain", { length: 255 }),
  status: int("status").notNull().default(0), // 0=Pending, 1=Connected, 2=Rejected, 3=Removed
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const globalConfigurations = mysqlTable("global_configurations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  logo: text("logo"),
  favicon: text("favicon"),
  cores_primaria: varchar("cores_primaria", { length: 7 }).default("#3B82F6"),
  cores_secundaria: varchar("cores_secundaria", { length: 7 }).default("#6366F1"),
  cores_fundo: varchar("cores_fundo", { length: 7 }).default("#F8FAFC"),
  nome_sistema: varchar("nome_sistema", { length: 255 }).default("Sistema Multi-Empresa"),
  nome_rodape: varchar("nome_rodape", { length: 255 }).default("© 2024 Multi-Empresa System"),
  nome_aba_navegador: varchar("nome_aba_navegador", { length: 255 }).default("Multi-Empresa Dashboard"),
  webshare_token: text("webshare_token"),
  updated_at: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const evolutionApiConfigurations = mysqlTable("evolution_api_configurations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  evolutionURL: text("evolution_url").notNull(),
  evolutionToken: text("evolution_token").notNull(),
  urlGlobalSistema: text("url_global_sistema"),
  status: varchar("status", { length: 20 }).default("disconnected"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const aiConfigurations = mysqlTable("ai_configurations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  apiKey: text("api_key").notNull(),
  modelo: varchar("modelo", { length: 50 }).default("gpt-4o"),
  temperatura: decimal("temperatura", { precision: 3, scale: 2 }).default("0.7"),
  numeroTokens: int("numero_tokens").default(1000),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const whatsappInstances = mysqlTable("whatsapp_instances", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  evolutionInstanceId: varchar("evolution_instance_id", { length: 255 }),
  evolutionToken: varchar("evolution_token", { length: 500 }), // Token específico da instância
  status: varchar("status", { length: 20 }).default("disconnected"), // 'connected' | 'disconnected'
  qrCode: text("qr_code"),
  aiAgentId: varchar("ai_agent_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const aiAgents = mysqlTable("ai_agents", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  prompt: text("prompt").notNull(),
  temperatura: decimal("temperatura", { precision: 3, scale: 2 }).default("0.7"),
  numeroTokens: int("numero_tokens").default(1000),
  modelo: varchar("modelo", { length: 50 }).default("gpt-4o"),
  trainingFiles: json("training_files"), // Array of file paths
  trainingContent: text("training_content"), // Extracted content from PDFs
  agentType: varchar("agent_type", { length: 20 }).default("main"), // 'main' | 'secondary'
  parentAgentId: varchar("parent_agent_id", { length: 36 }), // References another agent
  specialization: varchar("specialization", { length: 255 }), // What this secondary agent specializes in
  delegationKeywords: json("delegation_keywords"), // Array of keywords that trigger this agent
  status: varchar("status", { length: 20 }).default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const conversations = mysqlTable("conversations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  whatsappInstanceId: varchar("whatsapp_instance_id", { length: 36 }).notNull(),
  contactName: varchar("contact_name", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 20 }).notNull(),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at"),
  status: varchar("status", { length: 20 }).default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const messages = mysqlTable("messages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  conversationId: varchar("conversation_id", { length: 36 }).notNull(),
  content: text("content").notNull(),
  sender: varchar("sender", { length: 20 }).notNull(), // 'user' | 'ai' | 'agent'
  agentId: varchar("agent_id", { length: 36 }), // Which AI agent responded (if sender is 'ai')
  messageType: varchar("message_type", { length: 20 }).default("text"), // 'text' | 'image' | 'document'
  evolutionMessageId: varchar("evolution_message_id", { length: 255 }),
  mediaUrl: text("media_url"), // URL to download the image from Evolution API
  mediaBase64: text("media_base64"), // Base64 encoded image data
  caption: text("caption"), // Image caption/description from user
  createdAt: timestamp("created_at").defaultNow(),
});

export const contactLists = mysqlTable("contact_lists", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  totalContacts: int("total_contacts").default(0),
  validContacts: int("valid_contacts").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const contactListItems = mysqlTable("contact_list_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  contactListId: varchar("contact_list_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  valid: boolean("valid").default(true),
  error: text("error"), // Validation error message if invalid
  createdAt: timestamp("created_at").defaultNow(),
});

export const scheduledMessages = mysqlTable("scheduled_messages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  contactListId: varchar("contact_list_id", { length: 36 }).notNull(),
  instanceIds: json("instance_ids").notNull(), // Array of whatsapp instance IDs
  messageType: varchar("message_type", { length: 20 }).notNull(), // 'text' | 'audio' | 'image' | 'video'
  messageContent: text("message_content").notNull(),
  messages: json("messages"), // Array of multiple text messages (for text type only)
  useMultipleMessages: boolean("use_multiple_messages").default(false), // Whether to send multiple text messages
  fileName: varchar("file_name", { length: 255 }), // For media messages
  fileBase64: text("file_base64"), // Base64 encoded file for media messages
  scheduledDateTime: timestamp("scheduled_date_time").notNull(),
  intervalMin: int("interval_min").default(60), // Minimum interval between messages in seconds
  intervalMax: int("interval_max").default(120), // Maximum interval between messages in seconds
  useMultipleInstances: boolean("use_multiple_instances").default(false),
  randomizeInstances: boolean("randomize_instances").default(true),
  status: varchar("status", { length: 20 }).default("scheduled"), // 'scheduled' | 'processing' | 'completed' | 'cancelled' | 'failed'
  totalMessages: int("total_messages").default(0),
  sentMessages: int("sent_messages").default(0),
  failedMessages: int("failed_messages").default(0),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"), // Error details if failed
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const funnelStages = mysqlTable("funnel_stages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  companyId: varchar("company_id", { length: 36 }), // Nullable for global stages
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 7 }).notNull().default("#3B82F6"),
  order: int("order").notNull().default(0),
  isActive: boolean("is_active").default(true),
  isGlobal: boolean("is_global").default(false), // Flag para etapas globais
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const customers = mysqlTable("customers", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  email: varchar("email", { length: 255 }),
  company: varchar("company", { length: 255 }),
  funnelStageId: varchar("funnel_stage_id", { length: 36 }).notNull(),
  lastContact: timestamp("last_contact"),
  notes: text("notes"),
  value: decimal("value", { precision: 10, scale: 2 }),
  source: varchar("source", { length: 255 }).default("WhatsApp"),
  conversationId: varchar("conversation_id", { length: 36 }), // Link to the conversation that created this customer
  interestedCityId: varchar("interested_city_id", { length: 36 }), // Cidade de interesse extraída da conversa
  interestedPropertyType: varchar("interested_property_type", { length: 50 }), // Tipo de imóvel extraído da conversa
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const leads = mysqlTable("leads", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  email: varchar("email", { length: 255 }),
  source: varchar("source", { length: 255 }).default("Manual"),
  status: varchar("status", { length: 20 }).default("new"), // 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'
  notes: text("notes"),
  interestedCityId: varchar("interested_city_id", { length: 36 }), // City the lead is interested in
  interestedPropertyType: varchar("interested_property_type", { length: 50 }), // 'casa' | 'apartamento' | 'sala' | 'terreno' | 'sobrado' | 'chácara'
  interestedTransactionType: varchar("interested_transaction_type", { length: 20 }), // 'venda' | 'aluguel'
  convertedToCustomer: boolean("converted_to_customer").default(false),
  customerId: varchar("customer_id", { length: 36 }), // Link to customer if converted
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const properties = mysqlTable("properties", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  propertyType: varchar("property_type", { length: 50 }), // 'casa' | 'apartamento' | 'sala' | 'terreno' | 'sobrado' | 'chácara'
  street: varchar("street", { length: 255 }).notNull(),
  number: varchar("number", { length: 20 }).notNull(),
  proximity: varchar("proximity", { length: 255 }),
  neighborhood: varchar("neighborhood", { length: 100 }),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 2 }),
  zipCode: varchar("zip_code", { length: 10 }),
  privateArea: decimal("private_area", { precision: 8, scale: 2 }).notNull(),
  parkingSpaces: int("parking_spaces").notNull().default(0),
  bathrooms: int("bathrooms").notNull().default(1),
  bedrooms: int("bedrooms").notNull().default(0),
  description: text("description"),
  mapLocation: varchar("map_location", { length: 500 }), // Google Maps URL or coordinates
  transactionType: varchar("transaction_type", { length: 20 }).notNull().default("venda"), // 'venda' | 'locacao'
  status: varchar("status", { length: 20 }).default("active"), // 'active' | 'inactive'
  images: json("images").default([]), // Array of image file paths
  youtubeVideoUrl: varchar("youtube_video_url", { length: 500 }),
  amenities: json("amenities").default([]), // Array of amenity IDs
  featured: boolean("featured").default(false), // Se é propriedade em destaque no website
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const amenities = mysqlTable("amenities", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  icon: varchar("icon", { length: 100 }).notNull(), // Lucide icon name
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const cities = mysqlTable("cities", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Website Templates System Tables

export const websiteTemplates = mysqlTable("website_templates", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  thumbnail: varchar("thumbnail", { length: 500 }),
  category: varchar("category", { length: 100 }),
  features: json("features"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const companyWebsites = mysqlTable("company_websites", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  templateId: varchar("template_id", { length: 36 }).notNull(),
  config: json("config").notNull(), // TemplateConfig completo
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const companyAgents = mysqlTable("company_agents", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  avatar: varchar("avatar", { length: 500 }),
  role: varchar("role", { length: 100 }),
  bio: text("bio"),
  socialMedia: json("social_media"),
  propertiesSold: int("properties_sold").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const companyTestimonials = mysqlTable("company_testimonials", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  clientAvatar: varchar("client_avatar", { length: 500 }),
  rating: int("rating").notNull().default(5),
  comment: text("comment").notNull(),
  propertyType: varchar("property_type", { length: 100 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Plans Table
export const plans = mysqlTable("plans", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  name: varchar("name", { length: 255 }).notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  agentLimit: int("agent_limit").notNull().default(1),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Brokers Table (Corretores)
export const brokers = mysqlTable("brokers", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  companyId: varchar("company_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  whatsapp: varchar("whatsapp", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
  role: true,
  companyId: true,
});

export const insertCompanySchema = createInsertSchema(companies).pick({
  name: true,
  email: true,
  cnpj: true,
  phone: true,
  address: true,
  city: true,
  cep: true,
  avatar: true,
  responsibleName: true,
  responsiblePhone: true,
  responsibleEmail: true,
  planId: true,
  status: true,
});

export const insertCompanyCustomDomainSchema = createInsertSchema(companyCustomDomains).pick({
  companyId: true,
  requestedDomain: true,
  currentDomain: true,
  status: true,
});

export const insertGlobalConfigSchema = createInsertSchema(globalConfigurations).pick({
  logo: true,
  favicon: true,
  cores_primaria: true,
  cores_secundaria: true,
  cores_fundo: true,
  nome_sistema: true,
  nome_rodape: true,
  nome_aba_navegador: true,
  webshare_token: true,
});

export const insertEvolutionConfigSchema = createInsertSchema(evolutionApiConfigurations).pick({
  evolutionURL: true,
  evolutionToken: true,
  urlGlobalSistema: true,
});

export const insertAiConfigSchema = createInsertSchema(aiConfigurations).pick({
  apiKey: true,
  modelo: true,
  temperatura: true,
  numeroTokens: true,
});

export const insertWhatsappInstanceSchema = createInsertSchema(whatsappInstances).pick({
  companyId: true,
  name: true,
  phone: true,
  evolutionInstanceId: true,
  status: true,
  aiAgentId: true,
});

export const insertAiAgentSchema = createInsertSchema(aiAgents).pick({
  companyId: true,
  name: true,
  prompt: true,
  temperatura: true,
  numeroTokens: true,
  modelo: true,
  trainingFiles: true,
  trainingContent: true,
  agentType: true,
  parentAgentId: true,
  specialization: true,
  delegationKeywords: true,
});

export const insertConversationSchema = createInsertSchema(conversations).pick({
  whatsappInstanceId: true,
  contactName: true,
  contactPhone: true,
  lastMessage: true,
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  conversationId: true,
  content: true,
  sender: true,
  agentId: true,
  messageType: true,
  evolutionMessageId: true,
  mediaUrl: true,
  mediaBase64: true,
  caption: true,
});

export const insertContactListSchema = createInsertSchema(contactLists).pick({
  companyId: true,
  name: true,
  totalContacts: true,
  validContacts: true,
});

export const insertContactListItemSchema = createInsertSchema(contactListItems).pick({
  contactListId: true,
  name: true,
  phone: true,
  valid: true,
  error: true,
});

export const insertScheduledMessageSchema = createInsertSchema(scheduledMessages).pick({
  companyId: true,
  contactListId: true,
  instanceIds: true,
  messageType: true,
  messageContent: true,
  messages: true,
  useMultipleMessages: true,
  fileName: true,
  fileBase64: true,
  scheduledDateTime: true,
  intervalMin: true,
  intervalMax: true,
  useMultipleInstances: true,
  randomizeInstances: true,
  totalMessages: true,
});

export const insertFunnelStageSchema = createInsertSchema(funnelStages).pick({
  companyId: true,
  name: true,
  description: true,
  color: true,
  order: true,
  isActive: true,
  isGlobal: true,
});

export const insertCustomerSchema = createInsertSchema(customers).pick({
  companyId: true,
  name: true,
  phone: true,
  email: true,
  company: true,
  funnelStageId: true,
  lastContact: true,
  notes: true,
  value: true,
  source: true,
  conversationId: true,
});

export const insertLeadSchema = createInsertSchema(leads).pick({
  companyId: true,
  name: true,
  phone: true,
  email: true,
  source: true,
  status: true,
  notes: true,
  interestedCityId: true,
  interestedPropertyType: true,
  interestedTransactionType: true,
  convertedToCustomer: true,
  customerId: true,
});

export const insertPropertySchema = createInsertSchema(properties).pick({
  companyId: true,
  code: true,
  name: true,
  propertyType: true,
  street: true,
  number: true,
  proximity: true,
  neighborhood: true,
  city: true,
  state: true,
  zipCode: true,
  privateArea: true,
  parkingSpaces: true,
  bathrooms: true,
  bedrooms: true,
  description: true,
  mapLocation: true,
  transactionType: true,
  status: true,
  hasServiceArea: true,
  hasSocialBathroom: true,
  hasTvRoom: true,
  images: true,
  youtubeVideoUrl: true,
  featured: true,
}).extend({
  propertyType: z.string().nullable().optional(),
  proximity: z.string().nullable().optional(),
  neighborhood: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zipCode: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  mapLocation: z.string().nullable().optional(),
  // Accept numbers and convert them to the format expected by the database
  privateArea: z.union([z.string(), z.number()]).transform(val => typeof val === 'number' ? val.toString() : val),
  parkingSpaces: z.union([z.string(), z.number()]).transform(val => typeof val === 'number' ? Number(val) : Number(val)),
  bathrooms: z.union([z.string(), z.number()]).transform(val => typeof val === 'number' ? Number(val) : Number(val)),
  bedrooms: z.union([z.string(), z.number()]).transform(val => typeof val === 'number' ? Number(val) : Number(val)),
});

export const insertAmenitySchema = createInsertSchema(amenities).pick({
  companyId: true,
  name: true,
  icon: true,
});

export const insertCitySchema = createInsertSchema(cities).pick({
  companyId: true,
  name: true,
});

export const insertWebsiteTemplateSchema = createInsertSchema(websiteTemplates).pick({
  id: true,
  name: true,
  description: true,
  thumbnail: true,
  category: true,
  features: true,
});

export const insertCompanyWebsiteSchema = createInsertSchema(companyWebsites).pick({
  companyId: true,
  templateId: true,
  config: true,
  isActive: true,
});

export const insertCompanyAgentSchema = createInsertSchema(companyAgents).pick({
  companyId: true,
  name: true,
  email: true,
  phone: true,
  avatar: true,
  role: true,
  bio: true,
  socialMedia: true,
  propertiesSold: true,
  isActive: true,
});

export const insertCompanyTestimonialSchema = createInsertSchema(companyTestimonials).pick({
  companyId: true,
  clientName: true,
  clientAvatar: true,
  rating: true,
  comment: true,
  propertyType: true,
  isActive: true,
});

export const insertPlanSchema = createInsertSchema(plans).pick({
  name: true,
  price: true,
  agentLimit: true,
  isActive: true,
}).extend({
  isActive: z.union([z.boolean(), z.number()]).transform(val => Boolean(val)).optional(),
});

export const insertBrokerSchema = createInsertSchema(brokers).pick({
  companyId: true,
  name: true,
  email: true,
  whatsapp: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type CompanyCustomDomain = typeof companyCustomDomains.$inferSelect;
export type InsertCompanyCustomDomain = z.infer<typeof insertCompanyCustomDomainSchema>;
export type GlobalConfiguration = typeof globalConfigurations.$inferSelect;
export type InsertGlobalConfiguration = z.infer<typeof insertGlobalConfigSchema>;
export type EvolutionApiConfiguration = typeof evolutionApiConfigurations.$inferSelect;
export type InsertEvolutionApiConfiguration = z.infer<typeof insertEvolutionConfigSchema>;
export type AiConfiguration = typeof aiConfigurations.$inferSelect;
export type InsertAiConfiguration = z.infer<typeof insertAiConfigSchema>;
export type WhatsappInstance = typeof whatsappInstances.$inferSelect;
export type InsertWhatsappInstance = z.infer<typeof insertWhatsappInstanceSchema>;
export type AiAgent = typeof aiAgents.$inferSelect;
export type InsertAiAgent = z.infer<typeof insertAiAgentSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type ContactList = typeof contactLists.$inferSelect;
export type InsertContactList = z.infer<typeof insertContactListSchema>;
export type ContactListItem = typeof contactListItems.$inferSelect;
export type InsertContactListItem = z.infer<typeof insertContactListItemSchema>;
export type ScheduledMessage = typeof scheduledMessages.$inferSelect;
export type InsertScheduledMessage = z.infer<typeof insertScheduledMessageSchema>;
export type FunnelStage = typeof funnelStages.$inferSelect;
export type InsertFunnelStage = z.infer<typeof insertFunnelStageSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Lead = typeof leads.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Property = typeof properties.$inferSelect;
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Amenity = typeof amenities.$inferSelect;
export type InsertAmenity = z.infer<typeof insertAmenitySchema>;
export type City = typeof cities.$inferSelect;
export type InsertCity = z.infer<typeof insertCitySchema>;
export type WebsiteTemplate = typeof websiteTemplates.$inferSelect;
export type InsertWebsiteTemplate = z.infer<typeof insertWebsiteTemplateSchema>;
export type CompanyWebsite = typeof companyWebsites.$inferSelect;
export type InsertCompanyWebsite = z.infer<typeof insertCompanyWebsiteSchema>;
export type CompanyAgent = typeof companyAgents.$inferSelect;
export type InsertCompanyAgent = z.infer<typeof insertCompanyAgentSchema>;
export type CompanyTestimonial = typeof companyTestimonials.$inferSelect;
export type InsertCompanyTestimonial = z.infer<typeof insertCompanyTestimonialSchema>;
export type Plan = typeof plans.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Broker = typeof brokers.$inferSelect;
export type InsertBroker = z.infer<typeof insertBrokerSchema>;