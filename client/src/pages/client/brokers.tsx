import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Search, User, AlertCircle } from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';

interface Broker {
  id: string;
  companyId: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BrokerLimits {
  currentCount: number;
  limit: number;
  planName: string;
  canCreate: boolean;
}

export default function Brokers() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedBroker, setSelectedBroker] = useState<Broker | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    whatsapp: ''
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch broker limits
  const { data: limits } = useQuery<BrokerLimits>({
    queryKey: ['brokers-limits'],
    queryFn: async () => {
      return await apiGet('/brokers/limits');
    }
  });

  // Fetch brokers
  const { data: brokers = [], isLoading } = useQuery<Broker[]>({
    queryKey: ['brokers'],
    queryFn: async () => {
      return await apiGet('/brokers');
    }
  });

  // Create broker mutation
  const createMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; whatsapp: string }) => {
      return await apiPost('/brokers', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brokers'] });
      queryClient.invalidateQueries({ queryKey: ['brokers-limits'] });
      toast({
        title: 'Sucesso',
        description: 'Corretor criado com sucesso!',
      });
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: 'Erro',
        description: error.response?.data?.error || 'Erro ao criar corretor',
        variant: 'destructive',
      });
    }
  });

  // Update broker mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string; email: string; whatsapp: string } }) => {
      return await apiPut(`/brokers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brokers'] });
      toast({
        title: 'Sucesso',
        description: 'Corretor atualizado com sucesso!',
      });
      setIsEditOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: 'Erro',
        description: error.response?.data?.error || 'Erro ao atualizar corretor',
        variant: 'destructive',
      });
    }
  });

  // Delete broker mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiDelete(`/brokers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brokers'] });
      queryClient.invalidateQueries({ queryKey: ['brokers-limits'] });
      toast({
        title: 'Sucesso',
        description: 'Corretor excluído com sucesso!',
      });
      setIsDeleteOpen(false);
      setSelectedBroker(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Erro',
        description: error.response?.data?.error || 'Erro ao excluir corretor',
        variant: 'destructive',
      });
    }
  });

  const resetForm = () => {
    setFormData({ name: '', email: '', whatsapp: '' });
    setSelectedBroker(null);
  };

  const handleCreate = () => {
    if (!formData.name.trim()) {
      toast({
        title: 'Erro',
        description: 'Por favor, digite o nome do corretor',
        variant: 'destructive',
      });
      return;
    }
    createMutation.mutate(formData);
  };

  const handleUpdate = () => {
    if (!selectedBroker || !formData.name.trim()) {
      toast({
        title: 'Erro',
        description: 'Por favor, digite o nome do corretor',
        variant: 'destructive',
      });
      return;
    }
    updateMutation.mutate({ id: selectedBroker.id, data: formData });
  };

  const handleDelete = () => {
    if (selectedBroker) {
      deleteMutation.mutate(selectedBroker.id);
    }
  };

  const openEditDialog = (broker: Broker) => {
    setSelectedBroker(broker);
    setFormData({
      name: broker.name,
      email: broker.email || '',
      whatsapp: broker.whatsapp || ''
    });
    setIsEditOpen(true);
  };

  const openDeleteDialog = (broker: Broker) => {
    setSelectedBroker(broker);
    setIsDeleteOpen(true);
  };

  const filteredBrokers = brokers.filter(broker =>
    broker.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (broker.email && broker.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (broker.whatsapp && broker.whatsapp.includes(searchTerm))
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Carregando corretores...</div>
      </div>
    );
  }

  const canCreate = limits?.canCreate ?? true;
  const limitReached = limits && !limits.canCreate;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <User className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Corretores</h1>
          </div>
          {limits && (
            <Badge variant={limitReached ? "destructive" : "secondary"}>
              {limits.currentCount} / {limits.limit} corretores
            </Badge>
          )}
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()} disabled={!canCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Corretor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Corretor</DialogTitle>
              <DialogDescription>
                Adicione um novo corretor à sua equipe
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  placeholder="Nome do corretor"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@exemplo.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input
                  id="whatsapp"
                  placeholder="(00) 00000-0000"
                  value={formData.whatsapp}
                  onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateOpen(false);
                  resetForm();
                }}
              >
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Criando...' : 'Criar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Limit warning */}
      {limitReached && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Você atingiu o limite de {limits.limit} corretor(es) do seu plano ({limits.planName}).
            Para cadastrar mais corretores, entre em contato para fazer upgrade do seu plano.
          </AlertDescription>
        </Alert>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder="Buscar corretor..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Data de Criação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBrokers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {searchTerm ? 'Nenhum corretor encontrado' : 'Nenhum corretor cadastrado'}
                </TableCell>
              </TableRow>
            ) : (
              filteredBrokers.map((broker) => (
                <TableRow key={broker.id}>
                  <TableCell className="font-medium">{broker.name}</TableCell>
                  <TableCell>{broker.email || '-'}</TableCell>
                  <TableCell>{broker.whatsapp || '-'}</TableCell>
                  <TableCell>
                    {new Date(broker.createdAt).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => openEditDialog(broker)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => openDeleteDialog(broker)}
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

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Corretor</DialogTitle>
            <DialogDescription>
              Atualize os dados do corretor
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome *</Label>
              <Input
                id="edit-name"
                placeholder="Nome do corretor"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                placeholder="email@exemplo.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-whatsapp">WhatsApp</Label>
              <Input
                id="edit-whatsapp"
                placeholder="(00) 00000-0000"
                value={formData.whatsapp}
                onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditOpen(false);
                resetForm();
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Atualizando...' : 'Atualizar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Alert */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Corretor</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o corretor "{selectedBroker?.name}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedBroker(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
