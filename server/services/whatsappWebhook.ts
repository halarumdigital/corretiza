import { Request, Response } from "express";
import { AIService } from "./aiService";
import { EvolutionApiService } from "./evolutionApi";
import { getStorage } from "../storage";
import { WhatsappInstance } from "@shared/schema";
import { propertyService } from "./propertyService";
import fs from 'fs';
import path from 'path';

export interface WhatsAppMessage {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
    participant?: string;
  };
  message: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
  };
  messageTimestamp: number;
  pushName?: string;
  instance: string;
}

export interface WebhookData {
  event: string;
  instance: string;
  data: WhatsAppMessage;
}

export interface EvolutionWebhookData {
  data: {
    key?: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
      senderLid?: string;
    };
    message: {
      conversation?: string;
      extendedTextMessage?: {
        text: string;
      };
      imageMessage?: {
        url: string;
        mimetype: string;
        caption?: string;
        fileLength?: string;
        height?: number;
        width?: number;
        mediaKey?: string;
        fileEncSha256?: string;
        fileSha256?: string;
        jpegThumbnail?: string;
      };
    };
    pushName?: string;
    messageTimestamp: number;
    instanceId: string;
    messageType: string;
    status?: string;
  };
  sender: string;
  destination: string;
  date_time: string;
  server_url: string;
  apikey: string;
}

export class WhatsAppWebhookService {
  
  // Função para detectar tipo de imagem pelos magic bytes
  private detectImageType(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    
    console.log(`🔍 [DETECT] Buffer size: ${bytes.length} bytes`);
    console.log(`🔍 [DETECT] First 16 bytes: [${Array.from(bytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(', ')}]`);
    
    // PNG signature
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      console.log(`✅ [DETECT] Detected PNG format`);
      return 'png';
    }
    
    // JPEG signature  
    if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      console.log(`✅ [DETECT] Detected JPEG format`);
      return 'jpeg';
    }
    
    // GIF signature
    if (bytes.length >= 6 && 
        bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && 
        bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
      console.log(`✅ [DETECT] Detected GIF format`);
      return 'gif';
    }
    
    // WebP signature
    if (bytes.length >= 12 && 
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      console.log(`✅ [DETECT] Detected WebP format`);
      return 'webp';
    }
    
    // Default para JPEG se não conseguir detectar
    console.log(`⚠️ [DETECT] Unknown format, defaulting to JPEG`);
    return 'jpeg';
  }

  // Função para baixar imagem da Evolution API e converter para base64
  private async downloadImageAsBase64(imageUrl: string, instanceId: string): Promise<{base64: string, mimeType: string} | null> {
    try {
      console.log(`🖼️ [DOWNLOAD] Starting download from URL: ${imageUrl}`);
      
      // Obter configuração da Evolution API
      const storage = getStorage();
      const evolutionConfig = await storage.getEvolutionApiConfiguration();
      
      if (!evolutionConfig?.evolutionURL || !evolutionConfig?.evolutionToken) {
        console.error("❌ [DOWNLOAD] Evolution API configuration not found");
        return null;
      }

      console.log(`🔑 [DOWNLOAD] Using Evolution API: ${evolutionConfig.evolutionURL}`);
      console.log(`🔑 [DOWNLOAD] API Key: ${evolutionConfig.evolutionToken.substring(0, 10)}...`);

      // Fazer download da imagem via Evolution API
      const response = await fetch(imageUrl, {
        headers: {
          'apikey': evolutionConfig.evolutionToken
        }
      });

      console.log(`📡 [DOWNLOAD] Response status: ${response.status} ${response.statusText}`);
      console.log(`📡 [DOWNLOAD] Response headers:`, Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        console.error(`❌ [DOWNLOAD] Failed to download image: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error(`❌ [DOWNLOAD] Error response:`, errorText);
        return null;
      }

      // Converter para base64
      const buffer = await response.arrayBuffer();
      console.log(`📊 [DOWNLOAD] Buffer size: ${buffer.byteLength} bytes`);
      
      const imageType = this.detectImageType(buffer);
      console.log(`🔍 [DOWNLOAD] Detected image type: ${imageType}`);
      
      const base64 = Buffer.from(buffer).toString('base64');
      const mimeType = `image/${imageType}`;
      
      console.log(`✅ [DOWNLOAD] Image processed successfully:`);
      console.log(`   - Type: ${imageType}`);
      console.log(`   - MIME: ${mimeType}`);
      console.log(`   - Base64 length: ${base64.length} chars`);
      console.log(`   - Buffer size: ${buffer.byteLength} bytes`);
      
      // Verificar primeiros bytes do base64 para debug
      console.log(`🔍 [DOWNLOAD] First 100 chars of base64: ${base64.substring(0, 100)}`);
      
      return {
        base64,
        mimeType
      };
      
    } catch (error) {
      console.error("❌ [DOWNLOAD] Error downloading image:", error);
      return null;
    }
  }

  async handleEvolutionMessage(evolutionData: EvolutionWebhookData): Promise<void> {
    const messageId = Math.random().toString(36).substr(2, 9);
    const startTime = Date.now();

    try {
      console.log(`📨 [MSG-${messageId}] ========================================`);
      console.log(`📨 [MSG-${messageId}] RAW Evolution API message received!`);
      console.log(`📨 [MSG-${messageId}] Timestamp: ${new Date().toISOString()}`);
      console.log(`📨 [MSG-${messageId}] Event type: ${evolutionData.data?.messageType || 'unknown'}`);
      console.log(`📨 [MSG-${messageId}] FromMe: ${evolutionData.data?.key?.fromMe}`);
      console.log(`📨 [MSG-${messageId}] Status: ${evolutionData.data?.status}`);
      console.log(`📨 [MSG-${messageId}] InstanceId received: ${evolutionData.data?.instanceId}`);
      console.log(`📨 [MSG-${messageId}] Available message fields: ${Object.keys(evolutionData.data?.message || {}).join(', ')}`);

      // Log específico sobre o instanceId
      console.log(`🔍 [MSG-${messageId}] Analyzing instanceId:`);
      console.log(`  - data.instanceId: ${evolutionData.data?.instanceId}`);
      console.log(`  - (data as any).instance: ${(evolutionData.data as any)?.instance}`);
      console.log(`  - evolutionData.instance: ${(evolutionData as any)?.instance}`);
      console.log(`  - evolutionData.sender: ${evolutionData.sender}`);

      console.log(`📨 [MSG-${messageId}] Full raw data:`, JSON.stringify(evolutionData, null, 2));

      // Verificar se é uma mensagem válida para processar
      if (!this.shouldProcessEvolutionMessage(evolutionData)) {
        console.log("❌ Evolution message ignored - not suitable for processing");
        return;
      }

      const data = evolutionData.data;

      // CORREÇÃO: O instanceId pode vir em lugares diferentes
      let instanceIdentifier = data.instanceId;

      // Tentar outros campos possíveis
      if (!instanceIdentifier) {
        console.log("⚠️ No instanceId in data, checking alternative fields...");
        instanceIdentifier = (evolutionData as any).instance ||
                           (evolutionData as any).instanceName ||
                           (data as any).instance ||
                           (data as any).instanceName;

        console.log(`🔍 Found alternative instance identifier: ${instanceIdentifier}`);
      }

      // Se ainda não tem, usar o sender como última tentativa
      if (!instanceIdentifier && evolutionData.sender) {
        console.log("⚠️ Using sender as instance identifier:", evolutionData.sender);
        instanceIdentifier = evolutionData.sender;
      }

      // Atualizar o instanceId nos dados
      if (instanceIdentifier && instanceIdentifier !== data.instanceId) {
        console.log(`📝 Updating instanceId from ${data.instanceId} to ${instanceIdentifier}`);
        data.instanceId = instanceIdentifier;
      }

      // DEBUG: Ver todas as propriedades da mensagem
      console.log("🔍 [MESSAGE DEBUG] Full message structure:");
      console.log("🔍 [MESSAGE DEBUG] data.message keys:", Object.keys(data.message));
      console.log("🔍 [MESSAGE DEBUG] data.message:", JSON.stringify(data.message, null, 2));
      
      // Verificar tipos de mensagem
      const imageMessage = data.message.imageMessage;
      const audioMessage = data.message.audioMessage;
      const isImageMessage = !!imageMessage;
      const isAudioMessage = !!audioMessage;
      
      console.log(`🔍 [MESSAGE DEBUG] imageMessage found: ${!!imageMessage}`);
      console.log(`🔍 [MESSAGE DEBUG] audioMessage found: ${!!audioMessage}`);
      console.log(`🔍 [MESSAGE DEBUG] isImageMessage: ${isImageMessage}`);
      console.log(`🔍 [MESSAGE DEBUG] isAudioMessage: ${isAudioMessage}`);
      
      // DEBUG EXTRA para áudio
      if (isAudioMessage) {
        console.log(`🎤🎤🎤 [AUDIO DEBUG] DETECTADO ÁUDIO!!!`);
        console.log(`🎤 [AUDIO DEBUG] audioMessage:`, JSON.stringify(audioMessage, null, 2));
      } else {
        console.log(`❌ [AUDIO DEBUG] Não é áudio - messageType: ${data.messageType}`);
        console.log(`❌ [AUDIO DEBUG] data.message keys:`, Object.keys(data.message));
      }
      
      // Extrair o conteúdo da mensagem (texto ou legenda da imagem)
      let messageText = data.message.conversation || data.message.extendedTextMessage?.text;
      let caption: string | undefined;
      let mediaUrl: string | undefined;
      let mediaBase64: string | undefined;
      let mimeType: string | undefined;

      if (isImageMessage) {
        console.log("🖼️ Detected image message");
        console.log("🖼️ Image message data:", JSON.stringify(imageMessage, null, 2));
        caption = imageMessage.caption;
        mediaUrl = imageMessage.url;
        messageText = caption || "Imagem enviada";
        
        console.log(`🖼️ Extracted media URL: ${mediaUrl}`);
        console.log(`🖼️ Caption: ${caption}`);
        
        // PROCURAR BASE64 EM TODOS OS LOCAIS POSSÍVEIS!
        const evolutionMessage = evolutionData.data as any;
        console.log(`🔍 [BASE64 SEARCH] Full evolutionData structure:`, JSON.stringify(evolutionData, null, 2));
        
        // Tentar diferentes locais onde o base64 pode estar
        let foundBase64: string | undefined;
        
        if (evolutionMessage.message?.base64) {
          foundBase64 = evolutionMessage.message.base64;
          console.log(`🎯 Found base64 at evolutionMessage.message.base64`);
        } else if (evolutionMessage.base64) {
          foundBase64 = evolutionMessage.base64;
          console.log(`🎯 Found base64 at evolutionMessage.base64`);
        } else if ((imageMessage as any)?.base64) {
          foundBase64 = (imageMessage as any).base64;
          console.log(`🎯 Found base64 at imageMessage.base64`);
        } else {
          console.log(`❌ No base64 found in any expected location`);
        }
        
        if (foundBase64) {
          console.log(`🎯 USING EXISTING BASE64 from Evolution API!`);
          mediaBase64 = foundBase64;
          
          // Detectar tipo de imagem pelo base64
          const buffer = Buffer.from(foundBase64, 'base64');
          const imageType = this.detectImageType(buffer.buffer);
          mimeType = `image/${imageType}`;
          
          console.log(`🎯 Evolution API base64 ready: type=${imageType}, base64 length=${foundBase64.length}`);
        } else if (mediaUrl) {
          console.log(`🖼️ No base64 in message, trying to download from: ${mediaUrl}`);
          const imageData = await this.downloadImageAsBase64(mediaUrl, data.instanceId);
          console.log(`🖼️ Download result:`, imageData ? 'SUCCESS' : 'FAILED');
          if (imageData) {
            mediaBase64 = imageData.base64;
            mimeType = imageData.mimeType;
            console.log(`🖼️ Final image data: type=${mimeType}, base64 length=${mediaBase64.length}`);
          } else {
            console.log(`🖼️ Failed to download/process image`);
          }
        } else {
          console.log(`🖼️ No base64 or media URL found in image message`);
        }
      } else if (isAudioMessage) {
        console.log("🎤 Detected audio message");
        console.log("🎤 Audio message data:", JSON.stringify(audioMessage, null, 2));
        messageText = "Áudio enviado";
        
        // PROCURAR BASE64 DE ÁUDIO!
        const evolutionMessage = evolutionData.data as any;
        console.log(`🔍 [AUDIO BASE64 SEARCH] Searching for audio base64...`);
        
        let foundAudioBase64: string | undefined;
        
        if (evolutionMessage.message?.base64) {
          foundAudioBase64 = evolutionMessage.message.base64;
          console.log(`🎯 Found audio base64 at evolutionMessage.message.base64`);
        } else if (evolutionMessage.base64) {
          foundAudioBase64 = evolutionMessage.base64;
          console.log(`🎯 Found audio base64 at evolutionMessage.base64`);
        } else if ((audioMessage as any)?.base64) {
          foundAudioBase64 = (audioMessage as any).base64;
          console.log(`🎯 Found audio base64 at audioMessage.base64`);
        } else {
          console.log(`❌ No audio base64 found in any expected location`);
        }
        
        if (foundAudioBase64) {
          console.log(`🎯 USING EXISTING AUDIO BASE64 from Evolution API!`);
          mediaBase64 = foundAudioBase64;
          mimeType = 'audio/ogg'; // Default para WhatsApp
          
          console.log(`🎯 Evolution API audio base64 ready: base64 length=${foundAudioBase64.length}`);
        } else {
          console.log(`🎤 No audio base64 found`);
        }
      }

      if (!messageText) {
        console.log("❌ No text content or image found in Evolution message");
        return;
      }

      // Extrair o número do remetente CORRETO da mensagem
      // Primeiro verificar se é formato LID (Linked ID) que não é número real
      const remoteJid = (evolutionData.data as any).key?.remoteJid || '';
      const remoteJidAlt = (evolutionData.data as any).key?.remoteJidAlt || '';
      const isLidFormat = remoteJid.endsWith('@lid');

      console.log(`📞 [PHONE DEBUG] remoteJid: ${remoteJid}`);
      console.log(`📞 [PHONE DEBUG] remoteJidAlt: ${remoteJidAlt}`);
      console.log(`📞 [PHONE DEBUG] isLidFormat: ${isLidFormat}`);

      let senderPhone: string | undefined;

      if (isLidFormat) {
        // LID não é número real - usar remoteJidAlt que contém o número real
        console.log(`⚠️ [LID] Detectado formato LID - buscando número real...`);

        // Primeiro tentar remoteJidAlt (campo principal para número real em LID)
        if (remoteJidAlt && remoteJidAlt.includes('@s.whatsapp.net')) {
          senderPhone = remoteJidAlt.replace(/@s\.whatsapp\.net$/g, '');
          console.log(`✅ [LID] Número real encontrado em remoteJidAlt: ${senderPhone}`);
        } else {
          // Fallback: tentar outros campos
          const evolutionMessage = evolutionData.data as any;

          // Campos possíveis para o número real
          const possiblePhoneFields = [
            evolutionMessage.key?.participant?.replace(/@s\.whatsapp\.net$/g, ''),
            evolutionMessage.participant?.replace(/@s\.whatsapp\.net$/g, ''),
            (evolutionData as any).phone,
            (evolutionData as any).from?.replace(/@s\.whatsapp\.net$/g, ''),
            evolutionMessage.from?.replace(/@s\.whatsapp\.net$/g, ''),
          ];

          console.log(`📞 [LID DEBUG] Possíveis campos de telefone:`, JSON.stringify(possiblePhoneFields, null, 2));

          // Encontrar o primeiro número válido (que parece um telefone brasileiro)
          for (const field of possiblePhoneFields) {
            if (field) {
              const cleanPhone = String(field).replace(/\D/g, '');
              // Verificar se parece um telefone válido (10-13 dígitos)
              if (cleanPhone.length >= 10 && cleanPhone.length <= 13) {
                senderPhone = cleanPhone;
                console.log(`✅ [LID] Número real encontrado em campo alternativo: ${senderPhone}`);
                break;
              }
            }
          }

          // Se não encontrou número real, usar o LID mesmo (vai ficar no log)
          if (!senderPhone) {
            console.log(`❌ [LID] Não foi possível encontrar número real - usando LID como fallback`);
            senderPhone = remoteJid.replace(/@lid$/g, '');
          }
        }
      } else {
        // Formato normal - extrair número do remoteJid
        senderPhone = remoteJid.replace(/@s\.whatsapp\.net$/g, '');
      }

      if (!senderPhone) {
        console.log("❌ Could not extract sender phone from Evolution message");
        console.log("❌ Debug - data.key:", (evolutionData.data as any).key);
        console.log("❌ Debug - evolutionData.sender:", evolutionData.sender);
        return;
      }

      console.log(`📞 Sender phone extracted: ${senderPhone} (from remoteJid: ${remoteJid}, isLid: ${isLidFormat})`);
      
      // Extrair o pushName (nome do contato no WhatsApp)
      console.log(`👤 [PUSHNAME DEBUG] Buscando pushName...`);
      console.log(`👤 [PUSHNAME DEBUG] evolutionData.data.pushName: ${(evolutionData.data as any).pushName}`);
      console.log(`👤 [PUSHNAME DEBUG] evolutionData.data.key?.pushName: ${(evolutionData.data as any).key?.pushName}`);
      console.log(`👤 [PUSHNAME DEBUG] Full data:`, JSON.stringify({
        pushName: (evolutionData.data as any).pushName,
        keyPushName: (evolutionData.data as any).key?.pushName,
        sender: evolutionData.sender
      }));

      const pushName = (evolutionData.data as any).pushName || (evolutionData.data as any).key?.pushName || null;
      if (pushName) {
        console.log(`✅ [PUSHNAME] Contact pushName encontrado: "${pushName}"`);
      } else {
        console.log(`⚠️ [PUSHNAME] No pushName found in webhook data`);
      }

      // Buscar a instância no banco de dados
      console.log(`🔍 About to search for instance ID: ${data.instanceId}`);
      const storage = getStorage();

      // Priorizar o nome da instância (deploy1) ao invés do UUID
      let searchId = evolutionData.instance || data.instanceId;
      console.log(`🔍 [MSG-${messageId}] Using instance name for search: ${searchId}`);

      // Primeiro tentar buscar pelo evolutionInstanceId
      let dbInstance = await storage.getWhatsappInstanceByEvolutionId(searchId);

      // Se não encontrou, tentar buscar pelo nome
      if (!dbInstance) {
        console.log(`⚠️ No instance found with evolutionInstanceId: ${searchId}, trying by name...`);

        // Buscar todas as empresas e suas instâncias
        const companies = await storage.getAllCompanies();
        for (const company of companies) {
          const instances = await storage.getWhatsappInstancesByCompany(company.id);

          // Tentar encontrar pelo nome da instância (deploy1) ou evolutionInstanceId
          const found = instances.find(i =>
            i.name === searchId ||
            i.evolutionInstanceId === searchId ||
            i.name === evolutionData.instance ||  // Usar o nome que vem do Evolution
            i.evolutionInstanceId === data.instanceId
          );

          if (found) {
            dbInstance = found;
            console.log(`✅ Found instance by fallback: ${found.name}`);
            break;
          }
        }
      }

      if (!dbInstance) {
        console.log(`❌ Could not find instance for ID: ${data.instanceId}`);
        console.log(`❌ Searched by: evolutionInstanceId and name`);
        return;
      }

      const instanceName = dbInstance.name;
      console.log(`✅ Found instance: ${instanceName} (DB ID: ${dbInstance.id}, EvolutionId: ${dbInstance.evolutionInstanceId})`);

      console.log(`📱 Processing Evolution message from ${senderPhone} to instance ${instanceName}: "${messageText}"`);

      // Processar mensagem com IA (incluindo dados de imagem se presente)
      const messageContext = {
        phone: senderPhone,
        message: messageText,
        instanceId: data.instanceId, // evolutionInstanceId usado para busca no AIService
        databaseInstanceId: dbInstance.id, // ID real do banco de dados
        mediaUrl,
        mediaBase64,
        caption,
        mimeType,
        messageType: isImageMessage ? 'image' : isAudioMessage ? 'audio' : 'text',
        pushName: pushName // Adicionar o nome do contato
      };

      console.log(`🔄 About to call AIService.processMessage with:`, {
        ...messageContext,
        mediaBase64: mediaBase64 ? `[${mediaBase64.length} chars]` : undefined // Não logar base64 completo
      });
      
      const aiService = new AIService();
      const aiResponse = await aiService.processMessage(messageContext);

      console.log(`🤖 Raw AI Response:`, aiResponse);
      if (!aiResponse) {
        console.log("🤖 No AI response generated for Evolution message");
        return;
      }

      console.log(`🤖 AI Response for Evolution message: "${aiResponse.response}"`);
      console.log(`🔍 [DEBUG] Full AI Response object:`, JSON.stringify(aiResponse, null, 2));

      // Enviar resposta via Evolution API
      // IMPORTANTE: Usar o nome da instância, não o evolutionInstanceId
      console.log(`🚀 About to call sendResponse with instance: ${instanceName}, phone: ${senderPhone}`);
      console.log(`🔍 Instance details for sending: name=${instanceName}, evolutionId=${dbInstance.evolutionInstanceId}`);
      try {
        // Buscar configuração global da Evolution API para envio de imóveis
        const evolutionConfig = await storage.getEvolutionApiConfiguration();

        // Se há propriedades estruturadas (novo formato), enviar cada uma com suas imagens
        if (aiResponse.properties && aiResponse.properties.length > 0) {
          console.log(`🏠 [PROPERTIES] ========== INICIANDO ENVIO DE IMÓVEIS ==========`);
          console.log(`🏠 [PROPERTIES] Total de imóveis recebidos: ${aiResponse.properties.length}`);
          console.log(`🏠 [PROPERTIES] Códigos: ${aiResponse.properties.map((p: any) => p.code).join(', ')}`);
          console.log(`🏠 [PROPERTIES] Enviando ${aiResponse.properties.length} imóveis com suas imagens sequencialmente...`);

          // Verificar configuração - urlGlobalSistema pode ser string vazia ""
          const urlGlobalSistema = evolutionConfig?.urlGlobalSistema?.trim();
          console.log(`🔍 [PROPERTIES] urlGlobalSistema configurada: "${urlGlobalSistema || 'NÃO CONFIGURADA'}"`);

          if (!urlGlobalSistema) {
            console.error(`❌ [PROPERTIES] URL Global do Sistema não configurada ou vazia!`);
            console.error(`❌ [PROPERTIES] Configure em: Admin > Evolution API > URL Global do Sistema`);
            console.error(`❌ [PROPERTIES] Exemplo: https://dev.alugamais.com`);
          } else if (!evolutionConfig?.evolutionURL || !evolutionConfig?.evolutionToken) {
            console.error(`❌ [PROPERTIES] Configuração da Evolution API incompleta`);
          } else {
            const baseUrl = urlGlobalSistema.replace(/\/$/, '');
            console.log(`🌐 [PROPERTIES] URL Base configurada: ${baseUrl}`);

            const evolutionApi = new EvolutionApiService({
              baseURL: evolutionConfig.evolutionURL,
              token: evolutionConfig.evolutionToken
            });

            // Enviar mensagem de introdução do agente
            await this.sendResponse(instanceName, senderPhone, aiResponse.response, messageText, dbInstance.companyId);
            console.log(`✅ Mensagem de introdução enviada`);
            await new Promise(resolve => setTimeout(resolve, 800));

            // Para cada imóvel, enviar a descrição seguida das imagens
            for (let i = 0; i < aiResponse.properties.length; i++) {
              const property = aiResponse.properties[i];
              console.log(`\n🏠 [PROPERTY ${i + 1}] Processando: ${property.code}`);

              try {
                // 1. Enviar descrição do imóvel
                console.log(`📝 [PROPERTY ${i + 1}] Enviando descrição...`);
                await this.sendResponse(instanceName, senderPhone, property.description, '', dbInstance.companyId);
                console.log(`✅ [PROPERTY ${i + 1}] Descrição enviada`);

                // Aguardar entre descrição e imagens
                await new Promise(resolve => setTimeout(resolve, 800));

                // 2. Enviar imagens do imóvel (se houver)
                if (property.images && property.images.length > 0) {
                  console.log(`📸 [PROPERTY ${i + 1}] Enviando ${property.images.length} imagens...`);

                  for (let j = 0; j < property.images.length; j++) {
                    const imagePath = property.images[j];
                    try {
                      const fullImageUrl = `${baseUrl}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
                      console.log(`📸 [PROPERTY ${i + 1}] Imagem ${j + 1}/${property.images.length}: ${fullImageUrl}`);

                      await evolutionApi.sendMediaUrl(instanceName, senderPhone, fullImageUrl);
                      console.log(`✅ [PROPERTY ${i + 1}] Imagem ${j + 1} enviada`);

                      // Aguardar entre imagens
                      await new Promise(resolve => setTimeout(resolve, 600));
                    } catch (imageError) {
                      console.error(`❌ [PROPERTY ${i + 1}] Erro ao enviar imagem ${j + 1}:`, imageError);
                    }
                  }
                } else {
                  console.log(`ℹ️ [PROPERTY ${i + 1}] Sem imagens para enviar`);
                }

                // Aguardar entre imóveis
                if (i < aiResponse.properties.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
              } catch (propertyError) {
                console.error(`❌ [PROPERTY ${i + 1}] Erro ao processar imóvel ${property.code}:`, propertyError);
              }
            }

            console.log(`✅ [PROPERTIES] Todos os ${aiResponse.properties.length} imóveis foram processados`);

            // Enviar mensagem de fechamento com opções claras
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verificar se há mais imóveis disponíveis usando o campo hasMoreProperties
            const hasMore = aiResponse.hasMoreProperties === true;

            // Mensagem SEMPRE perguntando se quer ver mais ou agendar
            let mensagemFechamento = "";

            if (hasMore) {
              // Há mais imóveis - oferecer opção de ver mais OU agendar
              mensagemFechamento = `Você gostaria de ver mais ou quer agendar uma visita?`;
            } else {
              // Não há mais imóveis - apenas oferecer agendamento
              mensagemFechamento = `Esses são todos os imóveis disponíveis!\n\nQual deles você gostou? Me diga o código para agendar uma visita.`;
            }

            await this.sendResponse(instanceName, senderPhone, mensagemFechamento, '', dbInstance.companyId);
            console.log(`✅ [PROPERTIES] Mensagem de fechamento com opções enviada após imóveis (hasMore: ${hasMore})`);
          }
        } else {
          // Fallback para o formato antigo (apenas texto sem imóveis estruturados)
          await this.sendResponse(instanceName, senderPhone, aiResponse.response, messageText, dbInstance.companyId);
          console.log(`✅ Response sent successfully to ${senderPhone}`);

          // Se há imagens de imóveis para enviar (formato antigo - deprecated)
          if (aiResponse.propertyImages && aiResponse.propertyImages.length > 0) {
            console.log(`📸 [IMAGES] Enviando ${aiResponse.propertyImages.length} imagens de imóveis (formato antigo)...`);

            // Verificar configuração - urlGlobalSistema pode ser string vazia ""
            const urlGlobalSistemaOld = evolutionConfig?.urlGlobalSistema?.trim();

            if (!urlGlobalSistemaOld) {
              console.error(`❌ [IMAGES] URL Global do Sistema não configurada ou vazia!`);
              console.error(`❌ [IMAGES] Configure em: Admin > Evolution API > URL Global do Sistema`);
            } else if (!evolutionConfig?.evolutionURL || !evolutionConfig?.evolutionToken) {
              console.error(`❌ [IMAGES] Configuração da Evolution API incompleta`);
            } else {
              const baseUrl = urlGlobalSistemaOld.replace(/\/$/, '');
              const evolutionApi = new EvolutionApiService({
                baseURL: evolutionConfig.evolutionURL,
                token: evolutionConfig.evolutionToken
              });

              for (const imagePath of aiResponse.propertyImages) {
                try {
                  const fullImageUrl = `${baseUrl}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
                  console.log(`📸 [IMAGES] Enviando imagem: ${fullImageUrl}`);

                  await evolutionApi.sendMediaUrl(instanceName, senderPhone, fullImageUrl);
                  console.log(`✅ [IMAGES] Imagem enviada com sucesso`);

                  await new Promise(resolve => setTimeout(resolve, 500));
                } catch (imageError) {
                  console.error(`❌ [IMAGES] Erro ao enviar imagem ${imagePath}:`, imageError);
                }
              }

              console.log(`✅ [IMAGES] Todas as imagens foram processadas`);
            }
          }
        }
      } catch (sendError) {
        console.error(`❌ Error sending response to ${senderPhone}:`, sendError);
        console.log(`⚠️ Continuing to save conversation despite send error...`);
      }

      // Salvar conversa no banco de dados
      let agentIdToSave = aiResponse.activeAgentId;

      // Se não tem activeAgentId, buscar o agente principal da empresa
      if (!agentIdToSave && dbInstance.companyId) {
        console.log(`💾 [DEBUG] No activeAgentId, searching for main agent...`);
        try {
          const mainAgents = await storage.getMainAgentsByCompany(dbInstance.companyId);
          if (mainAgents.length > 0) {
            agentIdToSave = mainAgents[0].id;
            console.log(`💾 [DEBUG] Using main agent ID: ${agentIdToSave}`);
          }
        } catch (error) {
          console.error(`💾 [DEBUG] Error finding main agent:`, error);
        }
      }
      
      console.log(`💾 [DEBUG] Final agentId to save: ${agentIdToSave}`);
      
      // Preparar dados de imagem/áudio e pushName para salvar
      const messageData = {
        messageType: isImageMessage ? 'image' : isAudioMessage ? 'audio' : 'text',
        mediaUrl,
        mediaBase64,
        caption,
        mimeType,
        pushName // Adicionar o nome do contato
      };

      console.log(`💾 [WEBHOOK] Preparando para salvar conversa...`);
      console.log(`💾 [WEBHOOK] instanceName: ${instanceName}`);
      console.log(`💾 [WEBHOOK] senderPhone: ${senderPhone}`);
      console.log(`💾 [WEBHOOK] pushName: "${pushName}"`);
      console.log(`💾 [WEBHOOK] messageData:`, JSON.stringify(messageData, null, 2));

      // Se ainda não tem agentId, não salvar a mensagem com agente
      if (agentIdToSave) {
        console.log(`💾 [WEBHOOK] Chamando saveConversation com agentId: ${agentIdToSave}`);
        await aiService.saveConversation(
          instanceName,
          senderPhone,
          messageText,
          aiResponse.response,
          agentIdToSave,
          messageData
        );
      } else {
        console.log(`⚠️ [DEBUG] No valid agentId found, skipping conversation save with agent tracking`);
        // Salvar apenas a conversa sem rastreamento de agente
        await aiService.saveConversation(
          instanceName,
          senderPhone,
          messageText,
          aiResponse.response,
          'unknown', // Usar placeholder para agente desconhecido
          messageData
        );
      }

      const totalTime = Date.now() - startTime;
      console.log(`✅ [MSG-${messageId}] Evolution message processed successfully in ${totalTime}ms`);
      console.log(`📊 [MSG-${messageId}] Summary: Instance=${instanceName}, Phone=${senderPhone}, AgentUsed=${aiResponse?.activeAgentId || 'none'}`);

    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`❌ [MSG-${messageId}] CRITICAL ERROR processing Evolution API message after ${totalTime}ms:`, error);
      console.error(`❌ [MSG-${messageId}] ERROR STACK:`, error.stack);
      console.error(`❌ [MSG-${messageId}] ERROR MESSAGE:`, error.message);
      console.error(`❌ [MSG-${messageId}] ERROR TYPE:`, error.constructor.name);

      // Log do contexto quando há erro
      console.error(`❌ [MSG-${messageId}] CONTEXT AT ERROR:`, {
        evolutionDataKeys: Object.keys(evolutionData || {}),
        dataKeys: Object.keys(evolutionData?.data || {}),
        messageKeys: Object.keys(evolutionData?.data?.message || {})
      });
    }
  }

  async handleMessage(webhookData: WebhookData): Promise<void> {
    try {
      console.log("📨 Received WhatsApp message:", JSON.stringify(webhookData, null, 2));

      // Verificar se é uma mensagem válida para processar
      if (!this.shouldProcessMessage(webhookData)) {
        console.log("❌ Message ignored - not suitable for processing");
        return;
      }

      const message = webhookData.data;
      const instanceId = webhookData.instance;
      
      // Extrair o conteúdo da mensagem
      const messageText = this.extractMessageText(message);
      if (!messageText) {
        console.log("❌ No text content found in message");
        return;
      }

      // Extrair o número do remetente
      const senderPhone = this.extractSenderPhone(message);
      if (!senderPhone) {
        console.log("❌ Could not extract sender phone");
        return;
      }

      console.log(`📱 Processing message from ${senderPhone}: "${messageText}"`);

      // Processar mensagem com IA
      const aiService = new AIService();
      const aiResponse = await aiService.processMessage({
        phone: senderPhone,
        message: messageText,
        instanceId: instanceId
      });

      if (!aiResponse) {
        console.log("🤖 No AI response generated");
        return;
      }

      console.log(`🤖 AI Response: "${aiResponse.response}"`);

      // Enviar resposta via Evolution API
      await this.sendResponse(instanceId, senderPhone, aiResponse.response);

      // Salvar conversa no banco de dados
      await aiService.saveConversation(
        instanceId,
        senderPhone,
        messageText,
        aiResponse.response,
        aiResponse.activeAgentId || 'main'
      );

      console.log("✅ Message processed successfully");

    } catch (error) {
      console.error("❌ Error processing WhatsApp message:", error);
    }
  }

  private shouldProcessMessage(webhookData: WebhookData): boolean {
    // Verificar se é evento de mensagem
    if (webhookData.event !== 'message' && webhookData.event !== 'messages.upsert') {
      return false;
    }

    const message = webhookData.data;
    
    // Ignorar mensagens enviadas por nós mesmos
    if (message.key.fromMe) {
      return false;
    }

    // Verificar se tem conteúdo de texto
    const messageText = this.extractMessageText(message);
    if (!messageText || messageText.trim().length === 0) {
      return false;
    }

    return true;
  }

  private shouldProcessEvolutionMessage(evolutionData: EvolutionWebhookData): boolean {
    const data = evolutionData.data;
    
    console.log("🔍 [FILTER] shouldProcessEvolutionMessage called");
    console.log("🔍 [FILTER] data.key:", JSON.stringify(data.key, null, 2));
    console.log("🔍 [FILTER] data.messageType:", data.messageType);
    console.log("🔍 [FILTER] data.status:", data.status);
    console.log("🔍 [FILTER] evolutionData.destination:", evolutionData.destination);
    console.log("🔍 [FILTER] Available message types:", Object.keys(data.message));
    
    // CRÍTICO: Verificar se a mensagem foi enviada por nós (evitar loop infinito)
    if (data.key?.fromMe === true) {
      console.log("❌ [FILTER] Evolution message ignored - message sent by us (fromMe: true)");
      return false;
    }
    
    // Verificação adicional para mensagens PENDING com destination
    if (data.status === 'PENDING' && evolutionData.destination) {
      console.log("❌ Evolution message ignored - message sent by us (detected via status and destination)");
      return false;
    }
    
    // Verificar se tem conteúdo de texto, imagem ou áudio
    const messageText = data.message.conversation || data.message.extendedTextMessage?.text;
    const imageMessage = data.message.imageMessage;
    const audioMessage = data.message.audioMessage;
    
    if (!messageText && !imageMessage && !audioMessage) {
      console.log("❌ Evolution message ignored - no text, image or audio content");
      return false;
    }

    // Se tem texto mas não tem imagem/áudio, verificar se está vazio
    if (messageText && !imageMessage && !audioMessage && messageText.trim().length === 0) {
      console.log("❌ Evolution message ignored - empty text content");
      return false;
    }

    // Verificar se o tipo de mensagem é suportado (texto, imagem ou áudio)
    const supportedTypes = ['conversation', 'extendedTextMessage', 'imageMessage', 'audioMessage', 'text'];
    if (!supportedTypes.includes(data.messageType)) {
      console.log(`❌ Evolution message ignored - unsupported type: ${data.messageType}`);
      return false;
    }

    // Aceitar mensagens com DELIVERY_ACK, PENDING ou sem status
    const validStatuses = ['DELIVERY_ACK', 'PENDING', undefined];
    if (data.status && !validStatuses.includes(data.status)) {
      console.log(`❌ Evolution message ignored - invalid status: ${data.status}`);
      return false;
    }

    console.log(`✅ Evolution message accepted for processing - type: ${data.messageType}, status: ${data.status || 'none'}`);
    return true;
  }


  private extractMessageText(message: WhatsAppMessage): string | null {
    // Mensagem simples
    if (message.message.conversation) {
      return message.message.conversation;
    }

    // Mensagem de texto estendida
    if (message.message.extendedTextMessage?.text) {
      return message.message.extendedTextMessage.text;
    }

    return null;
  }

  private extractSenderPhone(message: WhatsAppMessage): string | null {
    const remoteJid = message.key.remoteJid;
    
    if (!remoteJid) {
      return null;
    }

    // Remover sufixos @s.whatsapp.net e @lid do número
    return remoteJid.replace(/@(s\.whatsapp\.net|lid)$/g, '');
  }

  private async sendResponse(instanceId: string, phone: string, response: string, userMessage?: string, companyId?: string): Promise<void> {
    const sendId = Math.random().toString(36).substr(2, 9);
    const startTime = Date.now();

    try {
      console.log(`📤 [SEND-${sendId}] ========================================`);
      console.log(`📤 [SEND-${sendId}] sendResponse called`);
      console.log(`📤 [SEND-${sendId}] Instance: ${instanceId}`);
      console.log(`📤 [SEND-${sendId}] Phone: ${phone}`);
      console.log(`📤 [SEND-${sendId}] Response length: ${response.length} chars`);
      console.log(`📤 [SEND-${sendId}] Response preview: "${response.substring(0, 100)}${response.length > 100 ? '...' : ''}"`);

      const storage = getStorage();

      console.log(`🔍 [SEND-${sendId}] Getting Evolution API configuration...`);
      const evolutionConfig = await storage.getEvolutionApiConfiguration();
      if (!evolutionConfig) {
        console.error(`❌ [SEND-${sendId}] Evolution API configuration not found`);
        return;
      }

      console.log(`✅ [SEND-${sendId}] Evolution API config found: ${evolutionConfig.evolutionURL}`);

      // Criar instância do serviço Evolution API
      const evolutionService = new EvolutionApiService({
        baseURL: evolutionConfig.evolutionURL,
        token: evolutionConfig.evolutionToken
      });

      console.log(`📡 [SEND-${sendId}] Calling Evolution API sendMessage...`);
      console.log(`📡 [SEND-${sendId}] URL: ${evolutionConfig.evolutionURL}/message/sendText/${instanceId}`);

      const sendStartTime = Date.now();
      await evolutionService.sendMessage(instanceId, phone, response);
      const sendTime = Date.now() - sendStartTime;

      const totalTime = Date.now() - startTime;
      console.log(`✅ [SEND-${sendId}] Message sent successfully in ${sendTime}ms (total: ${totalTime}ms)`);
      console.log(`📤 [SEND-${sendId}] Response delivered to ${phone}`);

      // 🏠 ENVIAR IMAGENS E VÍDEOS DOS IMÓVEIS SE A MENSAGEM FOR SOBRE PROPRIEDADES
      // NOTA: Esta lógica foi DESABILITADA pois as imagens já são enviadas no fluxo principal (handleEvolutionMessage)
      // Deixar este código ativo causaria envio duplicado de imagens
      /*
      if (userMessage && companyId && propertyService.isPropertySearchIntent(userMessage)) {
        console.log(`🏠 [SEND-${sendId}] Detectada busca de imóveis - DESABILITADO (enviado no fluxo principal)`);
      }
      */
      // FIM DO CÓDIGO DESABILITADO - as imagens são enviadas em handleEvolutionMessage

      // Código antigo comentado - mantido para referência
      if (false && userMessage && companyId && propertyService.isPropertySearchIntent(userMessage)) {
        console.log(`🏠 [SEND-${sendId}] Detectada busca de imóveis, buscando propriedades para enviar mídias...`);

        try {
          const properties = await propertyService.searchPropertiesFromMessage(userMessage, companyId);

          if (properties.length > 0) {
            console.log(`🏠 [SEND-${sendId}] Encontradas ${properties.length} propriedades, enviando mídias...`);

            // Obter URL base do sistema
            const urlGlobalSistema = evolutionConfig?.urlGlobalSistema?.trim();
            if (!urlGlobalSistema) {
              console.error(`❌ [SEND-${sendId}] URL Global do Sistema não configurada - não é possível enviar imagens`);
            } else {
              const baseUrl = urlGlobalSistema.replace(/\/$/, '');

              for (const property of properties) {
                // Enviar imagens usando URL (não base64)
                if (property.images && Array.isArray(property.images) && property.images.length > 0) {
                  console.log(`📸 [SEND-${sendId}] Enviando ${property.images.length} imagens do imóvel ${property.name}...`);

                  for (let i = 0; i < Math.min(property.images.length, 3); i++) { // Limitar a 3 imagens por imóvel
                    const imagePath = property.images[i];

                    try {
                      // Montar URL completa da imagem
                      const fullImageUrl = `${baseUrl}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;

                      const caption = i === 0
                        ? `📍 *${property.name}* - Código: ${property.code}\n${property.bedrooms} quartos, ${property.bathrooms} banheiros, ${property.parkingSpaces} vagas`
                        : undefined;

                      console.log(`📸 [SEND-${sendId}] Enviando imagem ${i + 1}/${property.images.length}: ${fullImageUrl}`);
                      await evolutionService.sendMediaUrl(instanceId, phone, fullImageUrl, caption);

                      // Delay entre envios para não sobrecarregar
                      await new Promise(resolve => setTimeout(resolve, 1500));
                    } catch (imageError) {
                      console.error(`❌ Erro ao enviar imagem ${imagePath}:`, imageError);
                    }
                  }
                }

                // Enviar link do vídeo do YouTube se disponível
                if (property.youtubeVideoUrl) {
                  console.log(`🎥 [SEND-${sendId}] Enviando link do vídeo do YouTube para ${property.name}...`);

                  try {
                    const videoMessage = `🎥 *Vídeo do imóvel ${property.name}*\n\n${property.youtubeVideoUrl}`;
                    await evolutionService.sendMessage(instanceId, phone, videoMessage);

                    // Delay entre envios
                    await new Promise(resolve => setTimeout(resolve, 1000));
                  } catch (videoError) {
                    console.error(`❌ Erro ao enviar link do vídeo:`, videoError);
                  }
                }
              }
            }

            console.log(`✅ [SEND-${sendId}] Mídias dos imóveis enviadas com sucesso!`);
          }
        } catch (mediaError) {
          console.error(`❌ [SEND-${sendId}] Erro ao enviar mídias dos imóveis:`, mediaError);
          // Não falhar o envio da mensagem se houver erro nas mídias
        }
      }

    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`❌ [SEND-${sendId}] CRITICAL ERROR sending response after ${totalTime}ms:`, error);
      console.error(`❌ [SEND-${sendId}] ERROR STACK:`, error.stack);
      console.error(`❌ [SEND-${sendId}] ERROR MESSAGE:`, error.message);
      console.error(`❌ [SEND-${sendId}] ERROR TYPE:`, error.constructor.name);
      console.error(`❌ [SEND-${sendId}] CONTEXT:`, { instanceId, phone, responseLength: response.length });
      throw error;
    }
  }
}

export const whatsappWebhookService = new WhatsAppWebhookService();