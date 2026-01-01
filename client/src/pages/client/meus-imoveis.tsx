import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import * as Icons from "lucide-react";
import { Home, Plus, MoreVertical, Edit, Power, MapPin, Car, Bath, Bed, Search, Upload, X, Image as ImageIcon, FileSpreadsheet, Download, AlertCircle, CheckCircle2, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import * as XLSX from "xlsx";

interface Property {
  id: string;
  companyId: string;
  code: string;
  name: string;
  propertyType?: string;
  street: string;
  number: string;
  proximity?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  privateArea: number;
  parkingSpaces: number;
  bathrooms: number;
  bedrooms: number;
  description?: string;
  mapLocation?: string;
  transactionType: string;
  status: string;
  images: string[];
  youtubeVideoUrl?: string;
  amenities: string[];
  price?: string;
  createdAt: string;
  updatedAt: string;
}

interface City {
  id: string;
  companyId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface Amenity {
  id: string;
  companyId: string;
  name: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
}

interface PropertyFormData {
  code: string;
  name: string;
  propertyType?: string;
  street: string;
  number: string;
  proximity?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  privateArea: string;
  parkingSpaces: string;
  bathrooms: string;
  bedrooms: string;
  description?: string;
  mapLocation?: string;
  transactionType: string;
  images: string[];
  youtubeVideoUrl?: string;
  amenities: string[]; // Array of amenity IDs
  price: string; // Valor formatado (ex: 1.450,00)
}

interface ImportedProperty {
  codigo: string;
  nome: string;
  tipo_imovel?: string;
  transacao: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep?: string;
  area_privativa: number;
  vagas: number;
  banheiros: number;
  quartos: number;
  descricao?: string;
  valor?: number;
  proximidade?: string;
  valid?: boolean;
  error?: string;
}

// Função para formatar valor no padrão brasileiro
const formatCurrency = (value: string): string => {
  // Remove tudo exceto números
  const numbers = value.replace(/\D/g, '');

  if (!numbers) return '';

  // Converte para número e divide por 100 para ter os centavos
  const amount = parseInt(numbers) / 100;

  // Formata no padrão brasileiro
  return amount.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Função para converter valor formatado para número (para salvar no banco)
const parseCurrency = (value: string): number | null => {
  if (!value) return null;

  // Remove pontos de milhar e substitui vírgula por ponto
  const cleanValue = value.replace(/\./g, '').replace(',', '.');
  const parsed = parseFloat(cleanValue);

  return isNaN(parsed) ? null : parsed;
};

const brazilianStates = [
  { value: "AC", label: "Acre" },
  { value: "AL", label: "Alagoas" },
  { value: "AP", label: "Amapá" },
  { value: "AM", label: "Amazonas" },
  { value: "BA", label: "Bahia" },
  { value: "CE", label: "Ceará" },
  { value: "DF", label: "Distrito Federal" },
  { value: "ES", label: "Espírito Santo" },
  { value: "GO", label: "Goiás" },
  { value: "MA", label: "Maranhão" },
  { value: "MT", label: "Mato Grosso" },
  { value: "MS", label: "Mato Grosso do Sul" },
  { value: "MG", label: "Minas Gerais" },
  { value: "PA", label: "Pará" },
  { value: "PB", label: "Paraíba" },
  { value: "PR", label: "Paraná" },
  { value: "PE", label: "Pernambuco" },
  { value: "PI", label: "Piauí" },
  { value: "RJ", label: "Rio de Janeiro" },
  { value: "RN", label: "Rio Grande do Norte" },
  { value: "RS", label: "Rio Grande do Sul" },
  { value: "RO", label: "Rondônia" },
  { value: "RR", label: "Roraima" },
  { value: "SC", label: "Santa Catarina" },
  { value: "SP", label: "São Paulo" },
  { value: "SE", label: "Sergipe" },
  { value: "TO", label: "Tocantins" }
];

export default function MeusImoveis() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTransactionType, setFilterTransactionType] = useState<string>("all");
  const [filterPropertyType, setFilterPropertyType] = useState<string>("all");
  const [uploadingImages, setUploadingImages] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Import states
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importedData, setImportedData] = useState<ImportedProperty[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<PropertyFormData>({
    code: "",
    name: "",
    street: "",
    number: "",
    proximity: "",
    neighborhood: "",
    city: "",
    state: "",
    zipCode: "",
    privateArea: "",
    parkingSpaces: "0",
    bathrooms: "1",
    bedrooms: "0",
    description: "",
    mapLocation: "",
    propertyType: "",
    transactionType: "venda",
    images: [],
    youtubeVideoUrl: "",
    amenities: [],
    price: ""
  });

  // Fetch properties
  const { data: properties = [], isLoading, error } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    queryFn: async () => {
      const response = await fetch("/api/properties", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch properties');
      }

      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
  });

  // Fetch cities
  const { data: cities = [], isLoading: isLoadingCities, error: citiesError } = useQuery<City[]>({
    queryKey: ["/api/cities"],
    queryFn: async () => {
      const response = await fetch("/api/cities", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch cities');
      }

      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    retry: 2,
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
  });

  // Fetch amenities
  const { data: amenities = [], isLoading: isLoadingAmenities } = useQuery<Amenity[]>({
    queryKey: ["/api/amenities"],
    queryFn: async () => {
      const response = await fetch("/api/amenities", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch amenities');
      }

      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    retry: 2,
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
  });

  // Filter properties based on search term and filters
  const filteredProperties = properties.filter((property) => {
    // Filter by search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase().trim();
      if (!property.name.toLowerCase().includes(searchLower) &&
          !property.code.toLowerCase().includes(searchLower)) {
        return false;
      }
    }

    // Filter by transaction type
    if (filterTransactionType !== "all" && property.transactionType !== filterTransactionType) {
      return false;
    }

    // Filter by property type
    if (filterPropertyType !== "all" && property.propertyType !== filterPropertyType) {
      return false;
    }

    return true;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredProperties.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProperties = filteredProperties.slice(startIndex, endIndex);

  // Reset page when filters change
  const handleFilterChange = (type: 'search' | 'transaction' | 'property', value: string) => {
    setCurrentPage(1);
    if (type === 'search') setSearchTerm(value);
    if (type === 'transaction') setFilterTransactionType(value);
    if (type === 'property') setFilterPropertyType(value);
  };

  // Create property mutation
  const createPropertyMutation = useMutation({
    mutationFn: async (propertyData: any) => {
      const response = await fetch("/api/properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify(propertyData)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar imóvel');
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      toast({ description: "Imóvel criado com sucesso!" });
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      console.error('Create property error:', error);
      toast({ 
        variant: "destructive",
        description: error.message || "Erro ao criar imóvel. Tente novamente." 
      });
    }
  });

  // Update property mutation
  const updatePropertyMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: any }) => fetch(`/api/properties/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify(data)
    }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      toast({ description: "Imóvel atualizado com sucesso!" });
      setEditingProperty(null);
      resetForm();
    },
    onError: () => {
      toast({ 
        variant: "destructive",
        description: "Erro ao atualizar imóvel. Tente novamente." 
      });
    }
  });

  // Delete property mutation
  const deletePropertyMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/properties/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`
      }
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      toast({ description: "Imóvel excluído com sucesso!" });
    },
    onError: () => {
      toast({ 
        variant: "destructive",
        description: "Erro ao excluir imóvel. Tente novamente." 
      });
    }
  });

  // Toggle status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string, status: string }) => fetch(`/api/properties/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify({ status: status === "active" ? "inactive" : "active" })
    }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      toast({ description: "Status do imóvel alterado com sucesso!" });
    },
    onError: () => {
      toast({ 
        variant: "destructive",
        description: "Erro ao alterar status do imóvel. Tente novamente." 
      });
    }
  });

  const resetForm = () => {
    setFormData({
      code: "",
      name: "",
      street: "",
      number: "",
      proximity: "",
      neighborhood: "",
      city: "",
      state: "",
      zipCode: "",
      privateArea: "",
      parkingSpaces: "0",
      bathrooms: "1",
      bedrooms: "0",
      description: "",
      mapLocation: "",
      propertyType: "",
      transactionType: "venda",
      images: [],
      youtubeVideoUrl: "",
      amenities: [],
      price: ""
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validação de campos obrigatórios
    if (!formData.code.trim()) {
      toast({
        variant: "destructive",
        description: "Por favor, preencha o código do imóvel."
      });
      return;
    }

    if (!formData.name.trim()) {
      toast({
        variant: "destructive",
        description: "Por favor, preencha o nome do imóvel."
      });
      return;
    }

    if (!formData.street.trim()) {
      toast({
        variant: "destructive",
        description: "Por favor, preencha o endereço (rua)."
      });
      return;
    }

    if (!formData.number.trim()) {
      toast({
        variant: "destructive",
        description: "Por favor, preencha o número do endereço."
      });
      return;
    }

    if (!formData.neighborhood.trim()) {
      toast({
        variant: "destructive",
        description: "Por favor, preencha o bairro."
      });
      return;
    }

    if (!formData.city) {
      toast({
        variant: "destructive",
        description: "Por favor, selecione uma cidade. Caso não haja cidades disponíveis, cadastre-as em Imóveis → Cidades."
      });
      return;
    }

    if (!formData.state) {
      toast({
        variant: "destructive",
        description: "Por favor, selecione um estado."
      });
      return;
    }

    if (!formData.privateArea || parseFloat(formData.privateArea) <= 0) {
      toast({
        variant: "destructive",
        description: "Por favor, preencha a área privativa com um valor válido."
      });
      return;
    }

    const propertyData = {
      ...formData,
      // Convert empty strings to null for optional fields
      proximity: formData.proximity || null,
      zipCode: formData.zipCode || null,
      description: formData.description || null,
      mapLocation: formData.mapLocation || null,
      youtubeVideoUrl: formData.youtubeVideoUrl || null,
      // Required fields - keep as is
      neighborhood: formData.neighborhood,
      city: formData.city,
      state: formData.state,
      // Convert numeric fields
      privateArea: parseFloat(formData.privateArea),
      parkingSpaces: parseInt(formData.parkingSpaces),
      bathrooms: parseInt(formData.bathrooms),
      bedrooms: parseInt(formData.bedrooms),
      // Include selected amenities
      amenities: formData.amenities,
      // Include images array
      images: formData.images,
      // Convert price from Brazilian format to number
      price: parseCurrency(formData.price),
    };

    if (editingProperty) {
      updatePropertyMutation.mutate({ id: editingProperty.id, data: propertyData });
    } else {
      createPropertyMutation.mutate(propertyData);
    }
  };

  const handleEdit = (property: Property) => {
    setEditingProperty(property);
    // Formata o preço do banco (número) para formato brasileiro
    let formattedPrice = "";
    if (property.price) {
      const priceNum = parseFloat(property.price);
      if (!isNaN(priceNum)) {
        formattedPrice = priceNum.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }
    }
    setFormData({
      code: property.code,
      name: property.name,
      street: property.street,
      number: property.number,
      proximity: property.proximity || "",
      neighborhood: property.neighborhood,
      city: property.city,
      state: property.state,
      zipCode: property.zipCode,
      privateArea: property.privateArea.toString(),
      parkingSpaces: property.parkingSpaces.toString(),
      bathrooms: property.bathrooms.toString(),
      bedrooms: property.bedrooms.toString(),
      description: property.description || "",
      mapLocation: property.mapLocation || "",
      propertyType: property.propertyType || "",
      transactionType: property.transactionType || "venda",
      images: property.images || [],
      youtubeVideoUrl: property.youtubeVideoUrl || "",
      amenities: property.amenities || [],
      price: formattedPrice
    });
    setIsAddDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsAddDialogOpen(false);
    setEditingProperty(null);
    resetForm();
  };

  const handleImageUpload = async (files: FileList) => {
    if (files.length === 0) return;
    
    if (formData.images.length + files.length > 5) {
      toast({
        variant: "destructive",
        description: "Máximo de 5 imagens permitidas por imóvel."
      });
      return;
    }

    setUploadingImages(true);
    
    try {
      const formDataUpload = new FormData();
      Array.from(files).forEach(file => {
        formDataUpload.append('images', file);
      });

      const response = await fetch('/api/properties/upload-images', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: formDataUpload
      });

      if (!response.ok) {
        throw new Error('Erro no upload');
      }

      const result = await response.json();
      
      setFormData(prev => ({
        ...prev,
        images: [...prev.images, ...result.images]
      }));

      toast({
        description: "Imagens enviadas com sucesso!"
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        variant: "destructive",
        description: "Erro ao fazer upload das imagens. Tente novamente."
      });
    } finally {
      setUploadingImages(false);
    }
  };

  const handleRemoveImage = async (imageToRemove: string) => {
    try {
      await fetch('/api/properties/images', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ imagePath: imageToRemove })
      });

      setFormData(prev => ({
        ...prev,
        images: prev.images.filter(img => img !== imageToRemove)
      }));

      toast({
        description: "Imagem removida com sucesso!"
      });
    } catch (error) {
      console.error('Remove image error:', error);
      toast({
        variant: "destructive",
        description: "Erro ao remover imagem."
      });
    }
  };

  // Função para processar arquivo Excel/CSV
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        // Mapear e validar os dados
        const mappedData: ImportedProperty[] = jsonData.map((row: any) => {
          const item: ImportedProperty = {
            codigo: String(row['codigo'] || row['Código'] || row['CODIGO'] || ''),
            nome: String(row['nome'] || row['Nome'] || row['NOME'] || ''),
            tipo_imovel: String(row['tipo_imovel'] || row['tipo'] || row['Tipo'] || row['TIPO'] || '').toLowerCase(),
            transacao: String(row['transacao'] || row['Transação'] || row['TRANSACAO'] || 'venda').toLowerCase(),
            rua: String(row['rua'] || row['Rua'] || row['RUA'] || row['endereco'] || row['Endereço'] || ''),
            numero: String(row['numero'] || row['Número'] || row['NUMERO'] || ''),
            bairro: String(row['bairro'] || row['Bairro'] || row['BAIRRO'] || ''),
            cidade: String(row['cidade'] || row['Cidade'] || row['CIDADE'] || ''),
            estado: String(row['estado'] || row['Estado'] || row['ESTADO'] || row['uf'] || row['UF'] || '').toUpperCase(),
            cep: String(row['cep'] || row['CEP'] || ''),
            area_privativa: parseFloat(row['area_privativa'] || row['area'] || row['Área'] || row['AREA'] || 0),
            vagas: parseInt(row['vagas'] || row['Vagas'] || row['VAGAS'] || 0),
            banheiros: parseInt(row['banheiros'] || row['Banheiros'] || row['BANHEIROS'] || 1),
            quartos: parseInt(row['quartos'] || row['Quartos'] || row['QUARTOS'] || 0),
            descricao: String(row['descricao'] || row['Descrição'] || row['DESCRICAO'] || ''),
            valor: parseFloat(String(row['valor'] || row['Valor'] || row['VALOR'] || row['preco'] || row['Preço'] || 0).replace(/[^\d.,]/g, '').replace(',', '.')),
            proximidade: String(row['proximidade'] || row['Proximidade'] || row['PROXIMIDADE'] || ''),
            valid: true,
            error: ''
          };

          // Validar campos obrigatórios
          const errors: string[] = [];
          if (!item.codigo) errors.push('Código obrigatório');
          if (!item.nome) errors.push('Nome obrigatório');
          if (!item.rua) errors.push('Rua obrigatória');
          if (!item.numero) errors.push('Número obrigatório');
          if (!item.bairro) errors.push('Bairro obrigatório');
          if (!item.cidade) errors.push('Cidade obrigatória');
          if (!item.estado) errors.push('Estado obrigatório');
          if (!item.area_privativa || item.area_privativa <= 0) errors.push('Área privativa inválida');

          // Normalizar tipo de transação
          if (item.transacao === 'locação' || item.transacao === 'locacao' || item.transacao === 'aluguel') {
            item.transacao = 'locacao';
          } else {
            item.transacao = 'venda';
          }

          // Normalizar tipo de imóvel
          const tipoMap: { [key: string]: string } = {
            'casa': 'casa',
            'apartamento': 'apartamento',
            'apto': 'apartamento',
            'sala': 'sala',
            'sala comercial': 'sala',
            'terreno': 'terreno',
            'lote': 'terreno',
            'sobrado': 'sobrado',
            'chácara': 'chácara',
            'chacara': 'chácara',
            'sitio': 'chácara',
            'sítio': 'chácara'
          };
          item.tipo_imovel = tipoMap[item.tipo_imovel || ''] || '';

          if (errors.length > 0) {
            item.valid = false;
            item.error = errors.join(', ');
          }

          return item;
        });

        setImportedData(mappedData);
        toast({
          description: `${mappedData.length} imóveis carregados do arquivo.`
        });
      } catch (error) {
        console.error('Error parsing file:', error);
        toast({
          variant: "destructive",
          description: "Erro ao processar arquivo. Verifique o formato."
        });
      }
    };
    reader.readAsBinaryString(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Função para baixar modelo de planilha
  const downloadTemplate = () => {
    const template = [
      {
        codigo: 'IMV001',
        nome: 'Apartamento Centro',
        tipo_imovel: 'apartamento',
        transacao: 'venda',
        rua: 'Rua das Flores',
        numero: '123',
        bairro: 'Centro',
        cidade: 'São Paulo',
        estado: 'SP',
        cep: '01234-567',
        area_privativa: 85.5,
        vagas: 2,
        banheiros: 2,
        quartos: 3,
        descricao: 'Apartamento espaçoso com vista para o parque',
        valor: 450000,
        proximidade: 'Próximo ao metrô'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo');

    // Ajustar largura das colunas
    ws['!cols'] = [
      { wch: 10 }, // codigo
      { wch: 25 }, // nome
      { wch: 15 }, // tipo_imovel
      { wch: 10 }, // transacao
      { wch: 25 }, // rua
      { wch: 8 },  // numero
      { wch: 15 }, // bairro
      { wch: 15 }, // cidade
      { wch: 5 },  // estado
      { wch: 12 }, // cep
      { wch: 15 }, // area_privativa
      { wch: 8 },  // vagas
      { wch: 10 }, // banheiros
      { wch: 8 },  // quartos
      { wch: 40 }, // descricao
      { wch: 12 }, // valor
      { wch: 25 }, // proximidade
    ];

    XLSX.writeFile(wb, 'modelo_imoveis.xlsx');
  };

  // Função para importar os imóveis
  const handleImportProperties = async () => {
    const validItems = importedData.filter(item => item.valid);

    if (validItems.length === 0) {
      toast({
        variant: "destructive",
        description: "Nenhum imóvel válido para importar."
      });
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: validItems.length });

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i];

      try {
        const propertyData = {
          code: item.codigo,
          name: item.nome,
          propertyType: item.tipo_imovel || null,
          transactionType: item.transacao,
          street: item.rua,
          number: item.numero,
          neighborhood: item.bairro,
          city: item.cidade,
          state: item.estado,
          zipCode: item.cep || null,
          privateArea: item.area_privativa,
          parkingSpaces: item.vagas,
          bathrooms: item.banheiros,
          bedrooms: item.quartos,
          description: item.descricao || null,
          price: item.valor || null,
          proximity: item.proximidade || null,
          images: [],
          amenities: []
        };

        const response = await fetch("/api/properties", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`
          },
          body: JSON.stringify(propertyData)
        });

        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        errorCount++;
      }

      setImportProgress({ current: i + 1, total: validItems.length });
    }

    setIsImporting(false);
    setIsImportDialogOpen(false);
    setImportedData([]);
    queryClient.invalidateQueries({ queryKey: ["/api/properties"] });

    toast({
      description: `Importação concluída: ${successCount} imóveis criados${errorCount > 0 ? `, ${errorCount} erros` : ''}.`
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Home className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Meus Imóveis</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão Importar */}
          <Button
            variant="outline"
            onClick={() => setIsImportDialogOpen(true)}
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Importar
          </Button>

          {/* Dialog de Importação */}
          <Dialog open={isImportDialogOpen} onOpenChange={(open) => {
            setIsImportDialogOpen(open);
            if (!open) {
              setImportedData([]);
            }
          }}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Importar Imóveis em Massa</DialogTitle>
                <DialogDescription>
                  Faça upload de um arquivo Excel (.xlsx) ou CSV com os dados dos imóveis.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Botão para baixar modelo */}
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">Modelo de Planilha</p>
                    <p className="text-sm text-muted-foreground">
                      Baixe o modelo para preencher corretamente os dados
                    </p>
                  </div>
                  <Button variant="outline" onClick={downloadTemplate}>
                    <Download className="w-4 h-4 mr-2" />
                    Baixar Modelo
                  </Button>
                </div>

                {/* Upload de arquivo */}
                <div className="space-y-2">
                  <Label>Selecionar Arquivo</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileUpload}
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Formatos aceitos: Excel (.xlsx, .xls) ou CSV (.csv)
                  </p>
                </div>

                {/* Preview dos dados */}
                {importedData.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Preview dos Dados ({importedData.length} imóveis)</Label>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center text-green-600">
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          {importedData.filter(i => i.valid).length} válidos
                        </span>
                        <span className="flex items-center text-red-600">
                          <AlertCircle className="w-4 h-4 mr-1" />
                          {importedData.filter(i => !i.valid).length} com erros
                        </span>
                      </div>
                    </div>

                    <div className="border rounded-lg overflow-x-auto max-h-[300px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">Status</TableHead>
                            <TableHead>Código</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Transação</TableHead>
                            <TableHead>Cidade/UF</TableHead>
                            <TableHead>Área</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead>Erro</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {importedData.map((item, index) => (
                            <TableRow key={index} className={!item.valid ? "bg-red-50" : ""}>
                              <TableCell>
                                {item.valid ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                                ) : (
                                  <AlertCircle className="w-4 h-4 text-red-600" />
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-sm">{item.codigo}</TableCell>
                              <TableCell>{item.nome}</TableCell>
                              <TableCell>{item.tipo_imovel || '-'}</TableCell>
                              <TableCell>
                                <Badge variant={item.transacao === 'venda' ? 'default' : 'outline'}>
                                  {item.transacao === 'venda' ? 'Venda' : 'Locação'}
                                </Badge>
                              </TableCell>
                              <TableCell>{item.cidade}/{item.estado}</TableCell>
                              <TableCell>{item.area_privativa}m²</TableCell>
                              <TableCell>
                                {item.valor ? `R$ ${item.valor.toLocaleString('pt-BR')}` : '-'}
                              </TableCell>
                              <TableCell className="text-red-600 text-xs max-w-[200px] truncate">
                                {item.error || '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Barra de progresso durante importação */}
                {isImporting && (
                  <div className="space-y-2 p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Importando imóveis...</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {importProgress.current} de {importProgress.total} imóveis processados
                    </p>
                  </div>
                )}

                {/* Botões de ação */}
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsImportDialogOpen(false);
                      setImportedData([]);
                    }}
                    disabled={isImporting}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleImportProperties}
                    disabled={importedData.length === 0 || isImporting || importedData.filter(i => i.valid).length === 0}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Importando...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Importar {importedData.filter(i => i.valid).length} Imóveis
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Dialog de Adicionar/Editar */}
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setIsAddDialogOpen(true)} className="bg-green-600 hover:bg-green-700">
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Novo
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingProperty ? "Editar Imóvel" : "Adicionar Novo Imóvel"}
              </DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Código do Imóvel *</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({...formData, code: e.target.value})}
                    placeholder="Ex: IMV001"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Imóvel *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="Ex: Apartamento Centro"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="propertyType">Tipo de Imóvel</Label>
                  <Select value={formData.propertyType || ""} onValueChange={(value) => setFormData({...formData, propertyType: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo de imóvel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casa">Casa</SelectItem>
                      <SelectItem value="apartamento">Apartamento</SelectItem>
                      <SelectItem value="sala">Sala Comercial</SelectItem>
                      <SelectItem value="terreno">Terreno</SelectItem>
                      <SelectItem value="sobrado">Sobrado</SelectItem>
                      <SelectItem value="chácara">Chácara</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transactionType">Tipo de Transação *</Label>
                  <Select value={formData.transactionType} onValueChange={(value) => setFormData({...formData, transactionType: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="venda">Venda</SelectItem>
                      <SelectItem value="locacao">Locação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="price">Valor (R$)</Label>
                  <Input
                    id="price"
                    value={formData.price}
                    onChange={(e) => setFormData({...formData, price: formatCurrency(e.target.value)})}
                    placeholder="Ex: 1.450,00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="street">Rua *</Label>
                  <Input
                    id="street"
                    value={formData.street}
                    onChange={(e) => setFormData({...formData, street: e.target.value})}
                    placeholder="Ex: Rua das Flores"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="number">Número *</Label>
                  <Input
                    id="number"
                    value={formData.number}
                    onChange={(e) => setFormData({...formData, number: e.target.value})}
                    placeholder="Ex: 123"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="proximity">Proximidade</Label>
                  <Input
                    id="proximity"
                    value={formData.proximity}
                    onChange={(e) => setFormData({...formData, proximity: e.target.value})}
                    placeholder="Ex: Próximo ao shopping"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="neighborhood">Bairro *</Label>
                  <Input
                    id="neighborhood"
                    value={formData.neighborhood}
                    onChange={(e) => setFormData({...formData, neighborhood: e.target.value})}
                    placeholder="Ex: Centro"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="city">Cidade *</Label>
                  {isLoadingCities ? (
                    <Select disabled value="">
                      <SelectTrigger>
                        <SelectValue placeholder="Carregando cidades..." />
                      </SelectTrigger>
                    </Select>
                  ) : citiesError ? (
                    <div className="space-y-2">
                      <Select disabled value="">
                        <SelectTrigger className="border-destructive">
                          <SelectValue placeholder="Erro ao carregar cidades" />
                        </SelectTrigger>
                      </Select>
                      <p className="text-sm text-destructive">
                        Não foi possível carregar as cidades. Tente novamente.
                      </p>
                    </div>
                  ) : cities.length === 0 ? (
                    <div className="space-y-2">
                      <Select disabled value="">
                        <SelectTrigger>
                          <SelectValue placeholder="Nenhuma cidade cadastrada" />
                        </SelectTrigger>
                      </Select>
                      <p className="text-sm text-muted-foreground">
                        Cadastre cidades em <span className="font-medium">Imóveis → Cidades</span>
                      </p>
                    </div>
                  ) : (
                    <Select
                      value={formData.city}
                      onValueChange={(value) => setFormData({...formData, city: value})}
                      required
                    >
                      <SelectTrigger className={!formData.city ? "border-muted-foreground" : ""}>
                        <SelectValue placeholder="Selecione uma cidade" />
                      </SelectTrigger>
                      <SelectContent>
                        {cities.map((city) => (
                          <SelectItem key={city.id} value={city.name}>
                            {city.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="state">Estado *</Label>
                  <Select
                    value={formData.state}
                    onValueChange={(value) => setFormData({...formData, state: value})}
                    required
                  >
                    <SelectTrigger className={!formData.state ? "border-muted-foreground" : ""}>
                      <SelectValue placeholder="Selecione o estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {brazilianStates.map((state) => (
                        <SelectItem key={state.value} value={state.value}>
                          {state.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="zipCode">CEP</Label>
                  <Input
                    id="zipCode"
                    value={formData.zipCode}
                    onChange={(e) => setFormData({...formData, zipCode: e.target.value})}
                    placeholder="Ex: 01234-567"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="privateArea">Área Privativa (m²) *</Label>
                  <Input
                    id="privateArea"
                    type="number"
                    step="0.01"
                    value={formData.privateArea}
                    onChange={(e) => setFormData({...formData, privateArea: e.target.value})}
                    placeholder="Ex: 85.50"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="parkingSpaces">Vagas de Garagem</Label>
                  <Input
                    id="parkingSpaces"
                    type="number"
                    min="0"
                    value={formData.parkingSpaces}
                    onChange={(e) => setFormData({...formData, parkingSpaces: e.target.value})}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="bathrooms">Banheiros</Label>
                  <Input
                    id="bathrooms"
                    type="number"
                    min="1"
                    value={formData.bathrooms}
                    onChange={(e) => setFormData({...formData, bathrooms: e.target.value})}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="bedrooms">Quartos</Label>
                  <Input
                    id="bedrooms"
                    type="number"
                    min="0"
                    value={formData.bedrooms}
                    onChange={(e) => setFormData({...formData, bedrooms: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Descreva o imóvel..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mapLocation">Localização no Mapa</Label>
                <Input
                  id="mapLocation"
                  value={formData.mapLocation}
                  onChange={(e) => setFormData({...formData, mapLocation: e.target.value})}
                  placeholder="Ex: https://maps.google.com/... ou coordenadas"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="youtubeVideoUrl">Vídeo do YouTube</Label>
                <Input
                  id="youtubeVideoUrl"
                  value={formData.youtubeVideoUrl}
                  onChange={(e) => setFormData({...formData, youtubeVideoUrl: e.target.value})}
                  placeholder="Ex: https://www.youtube.com/watch?v=..."
                />
              </div>

              {/* Seção de Comodidades */}
              <div className="space-y-2">
                <Label>Comodidades</Label>
                {isLoadingAmenities ? (
                  <div className="text-sm text-muted-foreground">Carregando comodidades...</div>
                ) : amenities.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    Nenhuma comodidade cadastrada. Cadastre em <span className="font-medium">Imóveis → Comodidades</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4 border rounded-md">
                    {amenities.map((amenity) => {
                      const IconComponent = (Icons as any)[amenity.icon];
                      return (
                        <div key={amenity.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`amenity-${amenity.id}`}
                            checked={formData.amenities.includes(amenity.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setFormData({
                                  ...formData,
                                  amenities: [...formData.amenities, amenity.id]
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  amenities: formData.amenities.filter(id => id !== amenity.id)
                                });
                              }
                            }}
                          />
                          <Label
                            htmlFor={`amenity-${amenity.id}`}
                            className="flex items-center gap-2 cursor-pointer text-sm font-normal"
                          >
                            {IconComponent && <IconComponent className="w-4 h-4" />}
                            {amenity.name}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>


              {/* Seção de Upload de Imagens */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Imagens do Imóvel (Máximo 5)</Label>
                  <span className="text-sm text-muted-foreground">
                    {formData.images.length}/5
                  </span>
                </div>
                
                {/* Upload Area */}
                {formData.images.length < 5 && (
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => e.target.files && handleImageUpload(e.target.files)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={uploadingImages}
                    />
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:bg-muted/50 transition-colors">
                      {uploadingImages ? (
                        <div className="flex items-center justify-center space-x-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                          <span>Enviando imagens...</span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                          <p className="text-sm">
                            Clique aqui ou arraste imagens para fazer upload
                          </p>
                          <p className="text-xs text-muted-foreground">
                            JPEG, PNG, GIF, WebP (máx. 5MB por imagem)
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Image Preview Grid */}
                {formData.images.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {formData.images.map((image, index) => (
                      <div key={index} className="relative group">
                        <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                          <img
                            src={image}
                            alt={`Imóvel ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(image)}
                          className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={createPropertyMutation.isPending || updatePropertyMutation.isPending}
                >
                  {editingProperty ? "Atualizar" : "Criar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Search and Filters Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-md w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Buscar por nome ou código do imóvel..."
            value={searchTerm}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Transaction Type Filter */}
        <div className="w-full sm:w-40">
          <Select value={filterTransactionType} onValueChange={(value) => handleFilterChange('transaction', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Transação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Transações</SelectItem>
              <SelectItem value="venda">Venda</SelectItem>
              <SelectItem value="locacao">Locação</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Property Type Filter */}
        <div className="w-full sm:w-44">
          <Select value={filterPropertyType} onValueChange={(value) => handleFilterChange('property', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Tipo de Imóvel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Tipos</SelectItem>
              <SelectItem value="casa">Casa</SelectItem>
              <SelectItem value="apartamento">Apartamento</SelectItem>
              <SelectItem value="sala">Sala Comercial</SelectItem>
              <SelectItem value="terreno">Terreno</SelectItem>
              <SelectItem value="sobrado">Sobrado</SelectItem>
              <SelectItem value="chácara">Chácara</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(searchTerm || filterTransactionType !== "all" || filterPropertyType !== "all") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCurrentPage(1);
              setSearchTerm("");
              setFilterTransactionType("all");
              setFilterPropertyType("all");
            }}
          >
            Limpar Filtros
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lista de Imóveis</CardTitle>
            {properties.length > 0 && (
              <div className="text-sm text-muted-foreground">
                {filteredProperties.length > 0 ? (
                  <>
                    Mostrando {startIndex + 1}-{Math.min(endIndex, filteredProperties.length)} de {filteredProperties.length} imóveis
                    {filteredProperties.length !== properties.length && ` (${properties.length} total)`}
                  </>
                ) : (
                  <>{properties.length} {properties.length === 1 ? 'imóvel' : 'imóveis'}</>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Carregando imóveis...</div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              Erro ao carregar imóveis. Tente novamente.
            </div>
          ) : !Array.isArray(properties) || properties.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum imóvel cadastrado. Clique em "Adicionar Novo" para começar.
            </div>
          ) : filteredProperties.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum imóvel encontrado com os filtros aplicados.
            </div>
          ) : (
            <div className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Transação</TableHead>
                    <TableHead>Endereço</TableHead>
                    <TableHead>Detalhes</TableHead>
                    <TableHead>Área</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProperties.map((property) => (
                    <TableRow key={property.id}>
                      <TableCell className="font-medium">{property.code}</TableCell>
                      <TableCell>{property.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {property.propertyType === "casa" && "Casa"}
                          {property.propertyType === "apartamento" && "Apartamento"}
                          {property.propertyType === "sala" && "Sala Comercial"}
                          {property.propertyType === "terreno" && "Terreno"}
                          {property.propertyType === "sobrado" && "Sobrado"}
                          {property.propertyType === "chácara" && "Chácara"}
                          {!property.propertyType && "-"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {property.transactionType === "venda" ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Venda
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            Locação
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{property.street}, {property.number}</div>
                          <div className="text-muted-foreground">
                            {property.neighborhood}, {property.city}/{property.state}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-3 text-sm">
                          <div className="flex items-center">
                            <Bed className="w-3 h-3 mr-1" />
                            {property.bedrooms}
                          </div>
                          <div className="flex items-center">
                            <Bath className="w-3 h-3 mr-1" />
                            {property.bathrooms}
                          </div>
                          <div className="flex items-center">
                            <Car className="w-3 h-3 mr-1" />
                            {property.parkingSpaces}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{property.privateArea}m²</TableCell>
                      <TableCell>
                        <Badge 
                          variant={property.status === "active" ? "default" : "secondary"}
                          className={property.status === "active" 
                            ? "bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200" 
                            : "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-200"
                          }
                        >
                          {property.status === "active" ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(property)}>
                              <Edit className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => toggleStatusMutation.mutate({ id: property.id, status: property.status })}
                            >
                              <Power className="w-4 h-4 mr-2" />
                              {property.status === "active" ? "Desativar" : "Ativar"}
                            </DropdownMenuItem>
                            {property.mapLocation && (
                              <DropdownMenuItem 
                                onClick={() => window.open(property.mapLocation, '_blank')}
                              >
                                <MapPin className="w-4 h-4 mr-2" />
                                Ver Localização
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <div className="text-sm text-muted-foreground">
                  Página {currentPage} de {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>

                  {/* Page numbers */}
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          className="w-8 h-8 p-0"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}