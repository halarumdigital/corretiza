import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { Company, Plan } from "@shared/schema";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building, Plus, Search, Edit, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Companies() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    cnpj: "",
    phone: "",
    address: "",
    city: "",
    cep: "",
    responsibleName: "",
    responsiblePhone: "",
    responsibleEmail: "",
    planId: "",
    userEmail: "",
    userPassword: "",
    adminPassword: "", // Nova senha para o admin da empresa (apenas na edição)
  });

  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiPost("/companies", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "Sucesso",
        description: "Empresa criada com sucesso!",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao criar empresa",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiPut(`/companies/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "Sucesso",
        description: "Empresa atualizada com sucesso!",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao atualizar empresa",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/companies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({
        title: "Sucesso",
        description: "Empresa excluída com sucesso!",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao excluir empresa",
        variant: "destructive",
      });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiPut(`/companies/${id}`, { status }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({
        title: "Sucesso",
        description: `Acesso da empresa ${variables.status === 'active' ? 'habilitado' : 'desabilitado'} com sucesso!`,
      });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao alterar status da empresa",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      cnpj: "",
      phone: "",
      address: "",
      city: "",
      cep: "",
      responsibleName: "",
      responsiblePhone: "",
      responsibleEmail: "",
      planId: "",
      userEmail: "",
      userPassword: "",
      adminPassword: "",
    });
    setEditingCompany(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingCompany) {
      // Na edição, não enviar os campos de usuário de criação
      const { userEmail, userPassword, ...updateData } = formData;
      // Só enviar adminPassword se foi preenchido
      if (!updateData.adminPassword) {
        delete updateData.adminPassword;
      }
      updateMutation.mutate({ id: editingCompany.id, data: updateData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (company: Company) => {
    setEditingCompany(company);
    setFormData({
      name: company.name,
      email: company.email || "",
      cnpj: company.cnpj || "",
      phone: company.phone || "",
      address: company.address || "",
      city: company.city || "",
      cep: company.cep || "",
      responsibleName: company.responsibleName || "",
      responsiblePhone: company.responsiblePhone || "",
      responsibleEmail: company.responsibleEmail || "",
      planId: company.planId || "",
      userEmail: "",
      userPassword: "",
      adminPassword: "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir esta empresa?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleStatus = (company: Company) => {
    const newStatus = company.status === 'active' ? 'inactive' : 'active';
    toggleStatusMutation.mutate({ id: company.id, status: newStatus });
  };

  const filteredCompanies = companies.filter((company) =>
    company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (company.email && company.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (isLoading) {
    return <div>Carregando...</div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Gerenciamento de Empresas</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie as empresas cadastradas no sistema
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Empresa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingCompany ? "Editar Empresa" : "Nova Empresa"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Nome da Empresa *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="cnpj">CNPJ</Label>
                  <Input
                    id="cnpj"
                    value={formData.cnpj}
                    onChange={(e) => setFormData(prev => ({ ...prev, cnpj: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="cep">CEP</Label>
                  <Input
                    id="cep"
                    value={formData.cep}
                    onChange={(e) => setFormData(prev => ({ ...prev, cep: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="city">Cidade</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="address">Endereço</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                />
              </div>

              {/* Seleção de Plano */}
              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium mb-3">Plano</h4>
                <div>
                  <Label htmlFor="planId">Plano da Empresa</Label>
                  <Select
                    value={formData.planId}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, planId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um plano" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.filter(p => p.isActive).map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name} - R$ {parseFloat(plan.price?.toString() || "0").toFixed(2).replace('.', ',')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Selecione o plano que será atribuído a esta empresa
                  </p>
                </div>
              </div>

              {/* Dados do Responsável */}
              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium mb-3">Dados do Responsável</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="responsibleName">Nome do Responsável</Label>
                    <Input
                      id="responsibleName"
                      value={formData.responsibleName}
                      onChange={(e) => setFormData(prev => ({ ...prev, responsibleName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="responsiblePhone">Telefone do Responsável</Label>
                    <Input
                      id="responsiblePhone"
                      value={formData.responsiblePhone}
                      onChange={(e) => setFormData(prev => ({ ...prev, responsiblePhone: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="responsibleEmail">Email do Responsável</Label>
                    <Input
                      id="responsibleEmail"
                      type="email"
                      value={formData.responsibleEmail}
                      onChange={(e) => setFormData(prev => ({ ...prev, responsibleEmail: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Campos de usuário apenas na criação */}
              {!editingCompany && (
                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium mb-3">Usuário Administrador da Empresa</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="userEmail">Email do Usuário *</Label>
                      <Input
                        id="userEmail"
                        type="email"
                        value={formData.userEmail}
                        onChange={(e) => setFormData(prev => ({ ...prev, userEmail: e.target.value }))}
                        placeholder="usuario@empresa.com"
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Este será o email para login do administrador da empresa
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="userPassword">Senha *</Label>
                      <Input
                        id="userPassword"
                        type="password"
                        value={formData.userPassword}
                        onChange={(e) => setFormData(prev => ({ ...prev, userPassword: e.target.value }))}
                        placeholder="Digite a senha"
                        minLength={6}
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Mínimo de 6 caracteres
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Campo de senha apenas na edição */}
              {editingCompany && (
                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium mb-3">Alterar Senha do Administrador</h4>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label htmlFor="adminPassword">Nova Senha</Label>
                      <Input
                        id="adminPassword"
                        type="password"
                        value={formData.adminPassword}
                        onChange={(e) => setFormData(prev => ({ ...prev, adminPassword: e.target.value }))}
                        placeholder="Digite a nova senha (deixe vazio para não alterar)"
                        minLength={6}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Deixe em branco se não quiser alterar a senha. Mínimo de 6 caracteres.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editingCompany ? "Atualizar" : "Criar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent>
        <div className="mb-4">
          <div className="relative">
            <Input
              placeholder="Buscar empresas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
            <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
          </div>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCompanies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <div className="flex flex-col items-center space-y-2">
                      <Building className="w-12 h-12 text-muted-foreground" />
                      <p className="text-muted-foreground">Nenhuma empresa encontrada</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredCompanies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Building className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">{company.name}</div>
                          {company.email && (
                            <div className="text-sm text-muted-foreground">{company.email}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {company.planId ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          {plans.find(p => p.id === company.planId)?.name || "Plano não encontrado"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={company.status === 'active'}
                          onCheckedChange={() => handleToggleStatus(company)}
                          disabled={toggleStatusMutation.isPending}
                        />
                        <span className={`text-sm ${company.status === 'active' ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {company.status === 'active' ? 'Ativa' : 'Inativa'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{company.phone || "-"}</TableCell>
                    <TableCell>
                      {company.createdAt && company.createdAt !== '0000-00-00 00:00:00' 
                        ? format(new Date(company.createdAt), "dd/MM/yyyy", { locale: ptBR })
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(company)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(company.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
