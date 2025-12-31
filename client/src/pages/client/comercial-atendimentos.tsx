import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiGet, apiPut, apiDelete } from "@/lib/api";
import { FunnelStage, Customer } from "@/types";

interface City {
  id: string;
  name: string;
}
import {
  Users, MessageCircle, Phone, Calendar,
  MoreVertical, Edit, Trash2, Filter, Plus, Home, MapPin
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Customer interface moved to types file

interface KanbanColumn {
  stage: FunnelStage;
  customers: Customer[];
}

export default function ComercialAtendimentos() {
  const { toast } = useToast();
  const [draggedCustomer, setDraggedCustomer] = useState<Customer | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [localCustomers, setLocalCustomers] = useState<Customer[]>([]);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [createStageId, setCreateStageId] = useState<string>("");
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
    value: "",
    source: "",
    funnelStageId: "",
    interestedCityId: "",
    interestedPropertyType: "",
  });
  const [createForm, setCreateForm] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
    value: "",
    source: "Kanban",
    interestedCityId: "",
    interestedPropertyType: "",
  });

  // Fetch funnel stages
  const { data: funnelStages = [], isLoading: stagesLoading } = useQuery<FunnelStage[]>({
    queryKey: ["/api/funnel-stages"],
    queryFn: () => apiGet("/funnel-stages"),
  });

  // Fetch cities
  const { data: cities = [] } = useQuery<City[]>({
    queryKey: ["/api/cities"],
    queryFn: () => apiGet("/cities"),
  });

  // Fetch customers
  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => apiGet("/customers"),
  });

  // Sincronizar customers do backend com estado local
  useEffect(() => {
    if (customers.length > 0) {
      setLocalCustomers(customers);
    }
  }, [customers]);

  // Create Kanban columns based on funnel stages
  const activeStageIds = funnelStages.filter(stage => stage.isActive).map(stage => stage.id);
  const kanbanColumns: KanbanColumn[] = funnelStages
    .filter(stage => stage.isActive)
    .map(stage => ({
      stage,
      customers: localCustomers.filter(customer => customer.funnelStageId === stage.id)
    }));

  // Add customers without stage OR with invalid/old stage to first column
  const customersWithoutValidStage = localCustomers.filter(customer =>
    !customer.funnelStageId || !activeStageIds.includes(customer.funnelStageId)
  );
  if (kanbanColumns.length > 0 && customersWithoutValidStage.length > 0) {
    // Filter out customers already assigned to valid stages
    const customersToAdd = customersWithoutValidStage.filter(c =>
      !kanbanColumns.some(col => col.customers.some(existing => existing.id === c.id))
    );
    kanbanColumns[0].customers = [...kanbanColumns[0].customers, ...customersToAdd];
  }

  const editCustomerMutation = useMutation({
    mutationFn: async (updatedCustomer: Partial<Customer> & { id: string }) => {
      return apiPut(`/customers/${updatedCustomer.id}`, updatedCustomer);
    },
    onSuccess: (response, variables) => {
      // Atualizar o estado local dos clientes
      setLocalCustomers(prev => prev.map(customer => 
        customer.id === variables.id 
          ? { ...customer, ...response }
          : customer
      ));
      
      // Invalidar a query para refrescar os dados
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      
      setEditingCustomer(null);
      resetEditForm();
      
      toast({
        title: "Sucesso",
        description: "Cliente atualizado com sucesso!",
      });
    },
    onError: (error) => {
      console.error("Error editing customer:", error);
      toast({
        title: "Erro",
        description: "Erro ao editar cliente.",
        variant: "destructive",
      });
    },
  });

  // Delete customer mutation
  const deleteCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      return apiDelete(`/customers/${customerId}`);
    },
    onSuccess: (_, deletedId) => {
      setLocalCustomers(prev => prev.filter(customer => customer.id !== deletedId));
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Sucesso",
        description: "Cliente excluído com sucesso!",
      });
    },
    onError: (error) => {
      console.error("Error deleting customer:", error);
      toast({
        title: "Erro",
        description: "Erro ao excluir cliente.",
        variant: "destructive",
      });
    },
  });

  // Create customer mutation (also creates lead)
  const createCustomerMutation = useMutation({
    mutationFn: async (newCustomer: {
      name: string;
      phone: string;
      email?: string;
      notes?: string;
      value?: number;
      source: string;
      funnelStageId: string;
      interestedCityId?: string;
      interestedPropertyType?: string;
    }) => {
      // Create customer
      const customerResponse = await fetch("/api/customers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(newCustomer),
      });

      if (!customerResponse.ok) {
        throw new Error("Falha ao criar cliente");
      }

      const customer = await customerResponse.json();

      // Create lead
      const leadData = {
        name: newCustomer.name,
        phone: newCustomer.phone,
        email: newCustomer.email,
        source: newCustomer.source,
        status: "converted",
        notes: newCustomer.notes,
        interestedCityId: newCustomer.interestedCityId,
        interestedPropertyType: newCustomer.interestedPropertyType,
        convertedToCustomer: true,
        customerId: customer.id,
      };

      const leadResponse = await fetch("/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(leadData),
      });

      if (!leadResponse.ok) {
        console.warn("Falha ao criar lead, mas cliente foi criado com sucesso");
      }

      return customer;
    },
    onSuccess: (newCustomer) => {
      // Add to local state
      setLocalCustomers(prev => [...prev, newCustomer]);

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });

      // Reset form and close dialog
      resetCreateForm();
      setIsCreatingCustomer(false);
      setCreateStageId("");

      toast({
        title: "Sucesso",
        description: "Cliente e lead criados com sucesso!",
      });
    },
    onError: (error) => {
      console.error("Error creating customer:", error);
      toast({
        title: "Erro",
        description: "Erro ao criar cliente.",
        variant: "destructive",
      });
    },
  });

  const resetCreateForm = () => {
    setCreateForm({
      name: "",
      phone: "",
      email: "",
      notes: "",
      value: "",
      source: "Kanban",
      interestedCityId: "",
      interestedPropertyType: "",
    });
  };

  const resetEditForm = () => {
    setEditForm({
      name: "",
      phone: "",
      email: "",
      notes: "",
      value: "",
      source: "",
      funnelStageId: "",
      interestedCityId: "",
      interestedPropertyType: "",
    });
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setEditForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || "",
      notes: customer.notes || "",
      value: customer.value?.toString() || "",
      source: customer.source || "",
      funnelStageId: customer.funnelStageId,
      interestedCityId: customer.interestedCityId || "",
      interestedPropertyType: customer.interestedPropertyType || "",
    });
  };

  const handleSaveEdit = () => {
    if (!editingCustomer) return;
    
    if (!editForm.name.trim() || !editForm.phone.trim()) {
      toast({
        title: "Erro",
        description: "Nome e telefone são obrigatórios",
        variant: "destructive",
      });
      return;
    }

    editCustomerMutation.mutate({
      id: editingCustomer.id,
      name: editForm.name.trim(),
      phone: editForm.phone.trim(),
      email: editForm.email.trim() || undefined,
      notes: editForm.notes.trim() || undefined,
      value: editForm.value ? parseFloat(editForm.value) : undefined,
      source: editForm.source.trim() || undefined,
      funnelStageId: editForm.funnelStageId,
      interestedCityId: editForm.interestedCityId || undefined,
      interestedPropertyType: editForm.interestedPropertyType || undefined,
    });
  };

  const handleCancelEdit = () => {
    setEditingCustomer(null);
    resetEditForm();
  };

  const handleCreateCustomer = (stageId: string) => {
    setCreateStageId(stageId);
    setIsCreatingCustomer(true);
    resetCreateForm();
  };

  const handleSubmitCreate = () => {
    if (!createForm.name.trim() || !createForm.phone.trim()) {
      toast({
        title: "Erro",
        description: "Nome e telefone são obrigatórios",
        variant: "destructive",
      });
      return;
    }

    createCustomerMutation.mutate({
      name: createForm.name.trim(),
      phone: createForm.phone.trim(),
      email: createForm.email.trim() || undefined,
      notes: createForm.notes.trim() || undefined,
      value: createForm.value ? parseFloat(createForm.value) : undefined,
      source: createForm.source,
      funnelStageId: createStageId,
      interestedCityId: createForm.interestedCityId || undefined,
      interestedPropertyType: createForm.interestedPropertyType || undefined,
    });
  };

  const handleCancelCreate = () => {
    setIsCreatingCustomer(false);
    setCreateStageId("");
    resetCreateForm();
  };

  const handleDragStart = (e: React.DragEvent, customer: Customer) => {
    setDraggedCustomer(customer);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', customer.id);
    
    // Add drag image styling
    const dragTarget = e.currentTarget as HTMLElement;
    dragTarget.style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const dragTarget = e.currentTarget as HTMLElement;
    dragTarget.style.opacity = '1';
    setDraggedCustomer(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    setDragOverColumn(stageId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    // Only clear if we're leaving the column entirely
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetStageId: string) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (draggedCustomer && draggedCustomer.funnelStageId !== targetStageId) {
      // Atualizar o estado local dos clientes (otimistic update)
      setLocalCustomers(prev => prev.map(customer =>
        customer.id === draggedCustomer.id
          ? { ...customer, funnelStageId: targetStageId }
          : customer
      ));

      // Persistir a mudança no banco de dados
      editCustomerMutation.mutate({
        id: draggedCustomer.id,
        funnelStageId: targetStageId,
      }, {
        onSuccess: () => {
          const targetStage = funnelStages.find(s => s.id === targetStageId);
          toast({
            title: "Cliente movido",
            description: `${draggedCustomer.name} foi movido para ${targetStage?.name}`,
          });
        },
        onError: () => {
          // Reverter a mudança local em caso de erro
          setLocalCustomers(prev => prev.map(customer =>
            customer.id === draggedCustomer.id
              ? { ...customer, funnelStageId: draggedCustomer.funnelStageId }
              : customer
          ));
        }
      });

      console.log(`Moving customer ${draggedCustomer.id} to stage ${targetStageId}`);
    }

    setDraggedCustomer(null);
  };


  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatPhone = (phone: string) => {
    return phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  };

  if (stagesLoading || customersLoading) {
    return <div>Carregando etapas do funil e clientes...</div>;
  }

  if (funnelStages.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Filter className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhuma etapa do funil encontrada</h3>
          <p className="text-muted-foreground mb-4">
            Você precisa criar etapas do funil antes de gerenciar atendimentos.
          </p>
          <Button asChild>
            <a href="/client/comercial/funil">Criar Etapas do Funil</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6" />
          Atendimentos
        </h1>
        <p className="text-muted-foreground">
          Gerencie seus clientes no funil de vendas
        </p>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-6 overflow-x-auto pb-4">
        {kanbanColumns.map((column) => (
          <div
            key={column.stage.id}
            className={`flex-shrink-0 w-80 transition-all duration-200 ${
              dragOverColumn === column.stage.id 
                ? 'bg-blue-50 dark:bg-blue-950/20 ring-2 ring-blue-500 ring-opacity-50 rounded-lg' 
                : ''
            }`}
            onDragOver={handleDragOver}
            onDragEnter={(e) => handleDragEnter(e, column.stage.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column.stage.id)}
          >
            {/* Column Header */}
            <div className="mb-4">
              <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: column.stage.color }}
                  />
                  <div>
                    <h3 className="font-semibold">{column.stage.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {column.customers.length} {column.customers.length === 1 ? 'cliente' : 'clientes'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCreateCustomer(column.stage.id)}
                    className="h-8 w-8 p-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  <Badge variant="secondary">
                    {formatCurrency(column.customers.reduce((sum, customer) => sum + (customer.value || 0), 0))}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Customer Cards */}
            <div className="space-y-3 min-h-[400px]">
              {column.customers.map((customer) => (
                <Card
                  key={customer.id}
                  className={`cursor-move hover:shadow-md transition-all duration-200 ${
                    draggedCustomer?.id === customer.id 
                      ? 'opacity-50 scale-95 ring-2 ring-blue-500' 
                      : 'hover:scale-[1.02]'
                  }`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, customer)}
                  onDragEnd={handleDragEnd}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10">
                          <AvatarFallback>
                            {customer.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h4 className="font-semibold text-sm">{customer.name}</h4>
                        </div>
                      </div>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => handleEditCustomer(customer)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              if (confirm(`Deseja excluir o cliente "${customer.name}"?`)) {
                                deleteCustomerMutation.mutate(customer.id);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span>{formatPhone(customer.phone)}</span>
                      </div>
                      
                      {customer.email && (
                        <div className="flex items-center gap-2">
                          <MessageCircle className="w-4 h-4 text-muted-foreground" />
                          <span className="truncate">{customer.email}</span>
                        </div>
                      )}
                      
                      {customer.value && customer.value > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Valor:</span>
                          <span className="font-semibold text-green-600">
                            {formatCurrency(customer.value)}
                          </span>
                        </div>
                      )}

                      {customer.lastContact && (
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="text-muted-foreground">
                            Último contato: {new Date(customer.lastContact).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      )}

                      {customer.source && (
                        <div className="mt-2">
                          <Badge variant="outline" className="text-xs">
                            {customer.source}
                          </Badge>
                        </div>
                      )}

                      {customer.notes && (
                        <div className="mt-2 p-2 bg-muted rounded text-xs">
                          {customer.notes}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Empty state for column */}
              {column.customers.length === 0 && (
                <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 ${
                  dragOverColumn === column.stage.id 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' 
                    : 'border-muted-foreground/25'
                }`}>
                  <Users className={`w-8 h-8 mx-auto mb-2 ${
                    dragOverColumn === column.stage.id 
                      ? 'text-blue-500' 
                      : 'text-muted-foreground'
                  }`} />
                  <p className={`text-sm ${
                    dragOverColumn === column.stage.id 
                      ? 'text-blue-600 font-medium' 
                      : 'text-muted-foreground'
                  }`}>
                    {dragOverColumn === column.stage.id 
                      ? 'Solte o cliente aqui' 
                      : 'Arraste clientes para esta etapa'
                    }
                  </p>
                </div>
              )}

              {/* Drop zone when column has customers but drag is active */}
              {column.customers.length > 0 && draggedCustomer && dragOverColumn === column.stage.id && (
                <div className="border-2 border-dashed border-blue-500 bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 text-center">
                  <p className="text-sm text-blue-600 font-medium">
                    Solte aqui para mover para {column.stage.name}
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Edit Customer Modal */}
      <Dialog open={!!editingCustomer} onOpenChange={(open) => !open && handleCancelEdit()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
            <DialogDescription>
              Atualize as informações do cliente
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-stage">Etapa do Funil *</Label>
              <Select value={editForm.funnelStageId} onValueChange={(value) => setEditForm(prev => ({ ...prev, funnelStageId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {funnelStages.filter(s => s.isActive).map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: stage.color }}
                        />
                        {stage.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit-name">Nome *</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Nome do cliente"
              />
            </div>

            <div>
              <Label htmlFor="edit-phone">Telefone *</Label>
              <Input
                id="edit-phone"
                value={editForm.phone}
                onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="(11) 99999-9999"
              />
            </div>

            <div>
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="cliente@email.com"
              />
            </div>


            <div>
              <Label htmlFor="edit-value">Valor Potencial</Label>
              <Input
                id="edit-value"
                type="number"
                value={editForm.value}
                onChange={(e) => setEditForm(prev => ({ ...prev, value: e.target.value }))}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>

            <div>
              <Label htmlFor="edit-source">Origem</Label>
              <Input
                id="edit-source"
                value={editForm.source}
                onChange={(e) => setEditForm(prev => ({ ...prev, source: e.target.value }))}
                placeholder="Website, Indicação, etc."
              />
            </div>

            <div>
              <Label htmlFor="edit-city">Cidade de Interesse</Label>
              <Input
                id="edit-city"
                value={editForm.interestedCityId}
                onChange={(e) => setEditForm(prev => ({ ...prev, interestedCityId: e.target.value }))}
                placeholder="Ex: Joaçaba"
              />
            </div>

            <div>
              <Label htmlFor="edit-property-type">Tipo de Imóvel</Label>
              <Input
                id="edit-property-type"
                value={editForm.interestedPropertyType}
                onChange={(e) => setEditForm(prev => ({ ...prev, interestedPropertyType: e.target.value }))}
                placeholder="Ex: Apartamento"
              />
            </div>

            <div>
              <Label htmlFor="edit-notes">Observações</Label>
              <Textarea
                id="edit-notes"
                value={editForm.notes}
                onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Anotações sobre o cliente..."
                rows={3}
              />
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={handleCancelEdit}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSaveEdit}
                disabled={editCustomerMutation.isPending}
              >
                {editCustomerMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Customer Modal */}
      <Dialog open={isCreatingCustomer} onOpenChange={(open) => !open && handleCancelCreate()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Cliente</DialogTitle>
            <DialogDescription>
              Adicione um novo cliente ao funil de vendas
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="create-name">Nome *</Label>
              <Input
                id="create-name"
                value={createForm.name}
                onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Nome do cliente"
              />
            </div>

            <div>
              <Label htmlFor="create-phone">Telefone *</Label>
              <Input
                id="create-phone"
                value={createForm.phone}
                onChange={(e) => setCreateForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="(11) 99999-9999"
              />
            </div>

            <div>
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="cliente@email.com"
              />
            </div>

            <div>
              <Label htmlFor="create-value">Valor Potencial</Label>
              <Input
                id="create-value"
                type="number"
                value={createForm.value}
                onChange={(e) => setCreateForm(prev => ({ ...prev, value: e.target.value }))}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>

            <div>
              <Label htmlFor="create-source">Origem</Label>
              <Input
                id="create-source"
                value={createForm.source}
                onChange={(e) => setCreateForm(prev => ({ ...prev, source: e.target.value }))}
                placeholder="WhatsApp, Site, Referência..."
              />
            </div>

            <div>
              <Label htmlFor="create-notes">Observações</Label>
              <Textarea
                id="create-notes"
                value={createForm.notes}
                onChange={(e) => setCreateForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Anotações sobre o cliente..."
                rows={3}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={handleCancelCreate}>
                Cancelar
              </Button>
              <Button
                onClick={handleSubmitCreate}
                disabled={createCustomerMutation.isPending}
              >
                {createCustomerMutation.isPending ? "Criando..." : "Criar Cliente"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}