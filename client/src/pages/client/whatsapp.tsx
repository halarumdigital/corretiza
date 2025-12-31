import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { WhatsappInstance, AiAgent } from "@/types";
import { MessageSquare, Plus, Settings, Unlink, QrCode, RefreshCw, Trash2, CheckCircle, XCircle, Clock, Bot } from "lucide-react";

export default function WhatsApp() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
  });

  const { data: instances = [], isLoading } = useQuery<WhatsappInstance[]>({
    queryKey: ["/api/whatsapp-instances"],
  });

  const { data: agents = [] } = useQuery<AiAgent[]>({
    queryKey: ["/api/ai-agents"],
  });

  // Query to get connection status for each instance
  const getConnectionStatus = (instanceId: string) => {
    return useQuery({
      queryKey: ["/api/whatsapp-instances", instanceId, "status"],
      queryFn: () => apiGet(`/whatsapp-instances/${instanceId}/status`),
      refetchInterval: 30000, // Refresh every 30 seconds
      enabled: !!instanceId,
    });
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiPost("/whatsapp-instances/create-evolution", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-instances"] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "Sucesso",
        description: "Instância criada com sucesso na Evolution API!",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao criar instância",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/whatsapp-instances/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-instances"] });
      toast({
        title: "Sucesso",
        description: "Instância excluída com sucesso!",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao excluir instância",
        variant: "destructive",
      });
    },
  });

  const linkAgentMutation = useMutation({
    mutationFn: ({ instanceId, agentId }: { instanceId: string; agentId: string }) =>
      apiPost(`/whatsapp-instances/${instanceId}/link-agent`, { agentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-instances"] });
      toast({
        title: "Sucesso",
        description: "Agente vinculado com sucesso!",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao vincular agente",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const handleGenerateQR = async (instanceId: string) => {
    try {
      setSelectedInstance(instanceId);
      setQrLoading(true);
      setIsQrModalOpen(true);
      setQrCode(null);
      
      console.log("=== FRONTEND QR REQUEST ===");
      console.log("Instance ID:", instanceId);
      console.log("Token exists:", !!localStorage.getItem("token"));
      console.log("URL will be:", `/whatsapp-instances/${instanceId}/qr`);
      
      // Call Evolution API to generate QR code
      const response = await apiGet(`/whatsapp-instances/${instanceId}/qr`);
      console.log("QR Response received:", response);
      if (response.qrCode) {
        setQrCode(response.qrCode);
      }
    } catch (error: any) {
      console.error("Error generating QR:", error);
      
      // Check if the error is because instance is already connected
      if (error?.response?.data?.connected || error?.response?.data?.error?.includes("já está conectada")) {
        toast({
          title: "Instância Conectada",
          description: "Esta instância já está conectada ao WhatsApp. Para gerar um novo QR code, primeiro desconecte a instância.",
          variant: "default",
        });
      } else {
        toast({
          title: "Erro",
          description: error?.response?.data?.details || "Erro ao gerar QR Code",
          variant: "destructive",
        });
      }
      setIsQrModalOpen(false);
    } finally {
      setQrLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir esta instância?")) {
      deleteMutation.mutate(id);
    }
  };


  const handleWhatsAppConfig = async (instanceId: string) => {
    try {
      toast({
        title: "Configurando...",
        description: "Aplicando configurações do WhatsApp...",
      });

      await apiPost(`/whatsapp-instances/${instanceId}/settings`, {});
      
      toast({
        title: "Sucesso",
        description: "Configurações do WhatsApp aplicadas com sucesso",
      });
    } catch (error) {
      console.error("Error configuring WhatsApp:", error);
      toast({
        title: "Erro",
        description: "Erro ao configurar WhatsApp",
        variant: "destructive",
      });
    }
  };

  const handleAIConfig = async (instanceId: string) => {
    try {
      toast({
        title: "Configurando...",
        description: "Configurando webhook da IA...",
      });

      await apiPost(`/whatsapp-instances/${instanceId}/webhook`, {});
      
      toast({
        title: "Sucesso",
        description: "Webhook da IA configurado com sucesso",
      });
    } catch (error) {
      console.error("Error configuring AI:", error);
      toast({
        title: "Erro",
        description: "Erro ao configurar IA",
        variant: "destructive",
      });
    }
  };

  const handleLinkAgent = (instanceId: string, agentId: string) => {
    const finalAgentId = agentId === "none" ? "" : agentId;
    linkAgentMutation.mutate({ instanceId, agentId: finalAgentId });
  };

  const getAgentName = (agentId?: string) => {
    if (!agentId) return "Nenhum agente";
    const agent = agents.find(a => a.id === agentId);
    return agent ? agent.name : "Agente não encontrado";
  };

  const refreshConnectionStatus = () => {
    instances.forEach(instance => {
      queryClient.invalidateQueries({ 
        queryKey: ["/api/whatsapp-instances", instance.id, "status"] 
      });
    });
    // Também invalida a lista de instâncias
    queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-instances"] });
    toast({
      title: "Status atualizado",
      description: "Status de conexão atualizado para todas as instâncias",
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
      case 'connected':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'connecting':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'close':
      case 'disconnected':
      default:
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'open':
        return 'Conectado';
      case 'connecting':
        return 'Conectando';
      case 'close':
        return 'Desconectado';
      case 'connected':
        return 'Conectado';
      case 'disconnected':
        return 'Desconectado';
      default:
        return `Indefinido (${status})`;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
      case 'connected':
        return 'bg-green-400';
      case 'connecting':
        return 'bg-yellow-400';
      case 'close':
      case 'disconnected':
      default:
        return 'bg-red-400';
    }
  };

  // Component to display instance with real-time status
  const InstanceCard = ({ instance }: { instance: WhatsappInstance }) => {
    const { data: statusData, isLoading: statusLoading, error } = getConnectionStatus(instance.id);
    
    const connectionStatus = statusData?.state || statusData?.instance?.state || instance.status || 'disconnected';
    const instanceName = instance.name; // Sempre usar o nome limpo do banco de dados
    
    // Nome sempre vem limpo do banco de dados
    
    return (
      <div key={instance.id} className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${getStatusColor(connectionStatus)}`} />
            <div>
              <h4 className="font-medium flex items-center gap-2">
                {instanceName}
                {statusLoading && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />}
              </h4>
              <p className="text-sm text-muted-foreground">
                {instance.phone || "Sem telefone"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon(connectionStatus)}
            <Badge variant={connectionStatus === 'open' || connectionStatus === 'connected' ? 'default' : 'secondary'}>
              {getStatusText(connectionStatus)}
            </Badge>
          </div>
        </div>

        {/* Additional status info */}
        {statusData && (
          <div className="mb-3 p-2 bg-muted/50 rounded text-xs space-y-1">
            {statusData.instance?.profileName && (
              <div>
                <span className="font-medium">Perfil:</span> {statusData.instance.profileName}
              </div>
            )}
            {statusData.instance?.serverUrl && (
              <div>
                <span className="font-medium">Servidor:</span> {statusData.instance.serverUrl}
              </div>
            )}
            {error && (
              <div className="text-red-600">
                <span className="font-medium">Erro:</span> Não foi possível conectar à Evolution API
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end">
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAIConfig(instance.id)}
            >
              <Bot className="w-4 h-4 mr-1" />
              Configurar IA
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleWhatsAppConfig(instance.id)}
            >
              <Settings className="w-4 h-4 mr-1" />
              Configurar WhatsApp
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGenerateQR(instance.id)}
            >
              <QrCode className="w-4 h-4 mr-1" />
              QR Code
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDelete(instance.id)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Excluir
            </Button>
          </div>
        </div>

      </div>
    );
  };

  if (isLoading) {
    return <div>Carregando...</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Instances List */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Instâncias WhatsApp</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Gerencie suas instâncias de WhatsApp
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshConnectionStatus}
                data-testid="refresh-status-button"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Atualizar Status
              </Button>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm} className="bg-green-600 hover:bg-green-700">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Nova Instância
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova Instância WhatsApp</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Nome da Instância</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Atendimento Vendas"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="5511999999999"
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Telefone que será usado na instância WhatsApp
                    </p>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending}>
                      {createMutation.isPending ? "Criando..." : "Criar Instância"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>

          <CardContent className="space-y-4">
            {instances.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">Nenhuma instância encontrada</p>
              </div>
            ) : (
              instances.map((instance) => (
                <InstanceCard key={instance.id} instance={instance} />
              ))
            )}
          </CardContent>
        </Card>
      </div>


      {/* QR Code Modal */}
      <Dialog open={isQrModalOpen} onOpenChange={setIsQrModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              QR Code WhatsApp
            </DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-4">
            {qrLoading ? (
              <div className="w-64 h-64 mx-auto bg-muted rounded-lg flex items-center justify-center">
                <RefreshCw className="w-8 h-8 text-muted-foreground animate-spin" />
              </div>
            ) : qrCode ? (
              <div>
                <div className="w-64 h-64 mx-auto bg-muted rounded-lg flex items-center justify-center">
                  <img 
                    src={qrCode} 
                    alt="QR Code" 
                    className="max-w-full max-h-full rounded" 
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Escaneie o QR Code com seu WhatsApp para conectar a instância
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectedInstance && handleGenerateQR(selectedInstance)}
                  disabled={qrLoading}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Atualizar QR
                </Button>
              </div>
            ) : (
              <div className="w-64 h-64 mx-auto bg-muted rounded-lg flex items-center justify-center">
                <QrCode className="w-16 h-16 text-muted-foreground" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
