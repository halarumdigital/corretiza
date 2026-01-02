/**
 * Serviço de Agregação de Mensagens
 *
 * Quando um usuário envia múltiplas mensagens em sequência (ex: "bom dia", "tudo bem", "quero alugar"),
 * o sistema aguarda 15 segundos após a última mensagem antes de processar.
 * Isso permite que todas as mensagens sejam agrupadas e respondidas de uma só vez.
 */

import { EvolutionWebhookData } from "./whatsappWebhook";

// Tempo de espera em milissegundos (15 segundos)
const AGGREGATION_DELAY_MS = 15000;

interface PendingMessage {
  evolutionData: EvolutionWebhookData;
  messageText: string;
  timestamp: number;
  messageId: string;
}

interface MessageBuffer {
  messages: PendingMessage[];
  timer: NodeJS.Timeout | null;
  instanceId: string;
  phone: string;
}

class MessageAggregatorService {
  // Buffer de mensagens por usuário (chave: instanceId:phone)
  private messageBuffers: Map<string, MessageBuffer> = new Map();

  /**
   * Gera uma chave única para identificar um usuário em uma instância
   */
  private getBufferKey(instanceId: string, phone: string): string {
    return `${instanceId}:${phone}`;
  }

  /**
   * Extrai o número de telefone do remetente dos dados do webhook
   */
  private extractPhone(evolutionData: EvolutionWebhookData): string | null {
    const remoteJid = evolutionData.data?.key?.remoteJid;
    if (!remoteJid) return null;

    // Formato padrão: 5511999999999@s.whatsapp.net
    // Formato LID: 5511999999999@lid
    const match = remoteJid.match(/^(\d+)@/);
    return match ? match[1] : null;
  }

  /**
   * Extrai o texto da mensagem dos dados do webhook
   */
  private extractMessageText(evolutionData: EvolutionWebhookData): string {
    const message = evolutionData.data?.message;
    if (!message) return "";

    // Texto direto
    if (message.conversation) {
      return message.conversation;
    }

    // Texto estendido (com menções, etc)
    if (message.extendedTextMessage?.text) {
      return message.extendedTextMessage.text;
    }

    // Caption de imagem
    if (message.imageMessage?.caption) {
      return message.imageMessage.caption;
    }

    return "";
  }

  /**
   * Extrai o instanceId dos dados do webhook
   */
  private extractInstanceId(evolutionData: EvolutionWebhookData): string {
    return evolutionData.data?.instanceId ||
           (evolutionData.data as any)?.instance ||
           (evolutionData as any)?.instance ||
           "";
  }

  /**
   * Verifica se a mensagem é de mídia (imagem ou áudio)
   * Mensagens de mídia são processadas imediatamente sem agregação
   */
  private isMediaMessage(evolutionData: EvolutionWebhookData): boolean {
    const message = evolutionData.data?.message;
    if (!message) return false;

    return !!(message.imageMessage || (message as any).audioMessage);
  }

  /**
   * Adiciona uma mensagem ao buffer e gerencia o timer de agregação
   * Retorna true se a mensagem foi adicionada ao buffer (aguardar processamento)
   * Retorna false se a mensagem deve ser processada imediatamente (mídia)
   */
  async addMessage(
    evolutionData: EvolutionWebhookData,
    processCallback: (aggregatedData: EvolutionWebhookData) => Promise<void>
  ): Promise<boolean> {
    const phone = this.extractPhone(evolutionData);
    const instanceId = this.extractInstanceId(evolutionData);
    const messageId = evolutionData.data?.key?.id || Math.random().toString(36).substr(2, 9);

    if (!phone || !instanceId) {
      console.log(`⚠️ [AGGREGATOR] Não foi possível extrair phone ou instanceId, processando imediatamente`);
      await processCallback(evolutionData);
      return false;
    }

    // Mensagens de mídia são processadas imediatamente
    if (this.isMediaMessage(evolutionData)) {
      console.log(`📸 [AGGREGATOR] Mensagem de mídia detectada, processando imediatamente`);
      await processCallback(evolutionData);
      return false;
    }

    const messageText = this.extractMessageText(evolutionData);

    // Se não tem texto, processa imediatamente (pode ser status, etc)
    if (!messageText.trim()) {
      console.log(`⚠️ [AGGREGATOR] Mensagem sem texto, processando imediatamente`);
      await processCallback(evolutionData);
      return false;
    }

    const bufferKey = this.getBufferKey(instanceId, phone);
    const now = Date.now();

    console.log(`📥 [AGGREGATOR] Nova mensagem recebida:`);
    console.log(`   - Usuário: ${phone}`);
    console.log(`   - Instância: ${instanceId}`);
    console.log(`   - Texto: "${messageText}"`);
    console.log(`   - Buffer key: ${bufferKey}`);

    // Verificar se já existe um buffer para este usuário
    let buffer = this.messageBuffers.get(bufferKey);

    if (buffer) {
      // Cancelar o timer existente
      if (buffer.timer) {
        clearTimeout(buffer.timer);
        console.log(`⏱️ [AGGREGATOR] Timer anterior cancelado para ${bufferKey}`);
      }

      // Adicionar mensagem ao buffer existente
      buffer.messages.push({
        evolutionData,
        messageText,
        timestamp: now,
        messageId
      });

      console.log(`📦 [AGGREGATOR] Mensagem adicionada ao buffer existente (${buffer.messages.length} mensagens)`);
    } else {
      // Criar novo buffer
      buffer = {
        messages: [{
          evolutionData,
          messageText,
          timestamp: now,
          messageId
        }],
        timer: null,
        instanceId,
        phone
      };
      this.messageBuffers.set(bufferKey, buffer);

      console.log(`📦 [AGGREGATOR] Novo buffer criado para ${bufferKey}`);
    }

    // Criar novo timer
    buffer.timer = setTimeout(async () => {
      await this.processBuffer(bufferKey, processCallback);
    }, AGGREGATION_DELAY_MS);

    console.log(`⏱️ [AGGREGATOR] Timer iniciado - processamento em ${AGGREGATION_DELAY_MS / 1000} segundos`);

    return true;
  }

  /**
   * Processa todas as mensagens acumuladas no buffer
   */
  private async processBuffer(
    bufferKey: string,
    processCallback: (aggregatedData: EvolutionWebhookData) => Promise<void>
  ): Promise<void> {
    const buffer = this.messageBuffers.get(bufferKey);

    if (!buffer || buffer.messages.length === 0) {
      console.log(`⚠️ [AGGREGATOR] Buffer vazio ou não encontrado para ${bufferKey}`);
      this.messageBuffers.delete(bufferKey);
      return;
    }

    console.log(`🔄 [AGGREGATOR] Processando buffer ${bufferKey}`);
    console.log(`   - Total de mensagens: ${buffer.messages.length}`);

    // Combinar todas as mensagens em uma única
    const combinedText = buffer.messages
      .map(m => m.messageText)
      .join("\n");

    console.log(`📝 [AGGREGATOR] Texto combinado:`);
    console.log(`   "${combinedText}"`);

    // Usar o último evolutionData como base (tem os dados mais recentes)
    const lastMessage = buffer.messages[buffer.messages.length - 1];
    const aggregatedData: EvolutionWebhookData = JSON.parse(JSON.stringify(lastMessage.evolutionData));

    // Substituir o texto da mensagem pelo texto combinado
    if (aggregatedData.data?.message) {
      if (aggregatedData.data.message.conversation) {
        aggregatedData.data.message.conversation = combinedText;
      } else if (aggregatedData.data.message.extendedTextMessage) {
        aggregatedData.data.message.extendedTextMessage.text = combinedText;
      } else {
        // Criar campo conversation se não existir
        aggregatedData.data.message.conversation = combinedText;
      }
    }

    // Limpar o buffer
    this.messageBuffers.delete(bufferKey);

    console.log(`✅ [AGGREGATOR] Buffer processado e removido para ${bufferKey}`);

    // Chamar o callback de processamento
    try {
      await processCallback(aggregatedData);
      console.log(`✅ [AGGREGATOR] Processamento concluído com sucesso`);
    } catch (error) {
      console.error(`❌ [AGGREGATOR] Erro no processamento:`, error);
    }
  }

  /**
   * Retorna estatísticas do agregador
   */
  getStats(): { activeBuffers: number; totalPendingMessages: number } {
    let totalPendingMessages = 0;
    this.messageBuffers.forEach(buffer => {
      totalPendingMessages += buffer.messages.length;
    });

    return {
      activeBuffers: this.messageBuffers.size,
      totalPendingMessages
    };
  }

  /**
   * Limpa todos os buffers (útil para shutdown)
   */
  clearAllBuffers(): void {
    this.messageBuffers.forEach(buffer => {
      if (buffer.timer) {
        clearTimeout(buffer.timer);
      }
    });
    this.messageBuffers.clear();
    console.log(`🧹 [AGGREGATOR] Todos os buffers foram limpos`);
  }
}

// Exportar instância única do serviço
export const messageAggregatorService = new MessageAggregatorService();
