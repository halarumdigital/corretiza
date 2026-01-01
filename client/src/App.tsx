import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ThemeProvider } from "@/components/theme-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";

// Admin pages
import AdminDashboard from "@/pages/admin/dashboard";
import Configurations from "@/pages/admin/configurations";
import EvolutionApiSettings from "@/pages/admin/evolution-api";
import AiSettings from "@/pages/admin/ai-settings";
import Companies from "@/pages/admin/companies";
import CustomDomains from "@/pages/admin/custom-domains";
import Plans from "@/pages/admin/plans";
import AdminUsers from "@/pages/admin/users";

// Client pages
import ClientDashboard from "@/pages/client/dashboard";
import Profile from "@/pages/client/profile";
import WhatsApp from "@/pages/client/whatsapp";
import AiAgents from "@/pages/client/ai-agents";
import Conversations from "@/pages/client/conversations";
import WhatsAppDisparo from "@/pages/client/whatsapp-disparo";
import WhatsAppListaTransmissao from "@/pages/client/whatsapp-lista-transmissao";
import WhatsAppProxy from "@/pages/client/whatsapp-proxy";
import ComercialAtendimentos from "@/pages/client/comercial-atendimentos";
import ComercialLeads from "@/pages/client/comercial-leads";
import MeusImoveis from "@/pages/client/meus-imoveis";
import Amenities from "@/pages/client/amenities";
import Cities from "@/pages/client/cities";
import Brokers from "@/pages/client/brokers";
import Calendar from "@/pages/client/calendar";
import Domains from "@/pages/client/domains";
import WebsiteConfig from "@/pages/client/website-config";
import Agents from "@/pages/client/agents";
import Testimonials from "@/pages/client/testimonials";

interface ProtectedRouteProps {
  component: React.ComponentType;
  requiredRole?: 'admin' | 'client';
  title: string;
  subtitle?: string;
}

function ProtectedRoute({ component: Component, requiredRole, title, subtitle }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (requiredRole && user.role !== requiredRole) {
    return <Redirect to={user.role === 'admin' ? '/admin' : '/client'} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="ml-64 flex flex-col min-h-screen">
        <Header title={title} subtitle={subtitle} />
        <main className="flex-1 px-6 py-6">
          <Component />
        </main>
      </div>
    </div>
  );
}

function Router() {
  const { user, isLoading } = useAuth();

  return (
    <Switch>
      <Route path="/login" component={Login} />
      
      {/* Default redirect */}
      <Route path="/">
        {isLoading ? (
          <div className="min-h-screen flex items-center justify-center">Carregando...</div>
        ) : user ? (
          <Redirect to={user.role === 'admin' ? '/admin' : '/client'} />
        ) : (
          <Redirect to="/login" />
        )}
      </Route>

      {/* Admin routes */}
      <Route path="/admin">
        <ProtectedRoute 
          component={AdminDashboard}
          requiredRole="admin"
          title="Dashboard"
          subtitle="Visão geral do sistema"
        />
      </Route>
      <Route path="/admin/configurations">
        <ProtectedRoute 
          component={Configurations}
          requiredRole="admin"
          title="Configurações"
          subtitle="Configurações globais do sistema"
        />
      </Route>
      <Route path="/admin/evolution-api">
        <ProtectedRoute 
          component={EvolutionApiSettings}
          requiredRole="admin"
          title="Evolution API"
          subtitle="Configurações da Evolution API"
        />
      </Route>
      <Route path="/admin/ai-settings">
        <ProtectedRoute 
          component={AiSettings}
          requiredRole="admin"
          title="IA Global"
          subtitle="Configurações globais de IA"
        />
      </Route>
      <Route path="/admin/companies">
        <ProtectedRoute
          component={Companies}
          requiredRole="admin"
          title="Empresas"
          subtitle="Gerenciamento de empresas"
        />
      </Route>
      <Route path="/admin/custom-domains">
        <ProtectedRoute
          component={CustomDomains}
          requiredRole="admin"
          title="Domínios Customizados"
          subtitle="Gerenciamento de domínios personalizados"
        />
      </Route>
      <Route path="/admin/plans">
        <ProtectedRoute
          component={Plans}
          requiredRole="admin"
          title="Planos"
          subtitle="Gerenciamento de planos"
        />
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute
          component={AdminUsers}
          requiredRole="admin"
          title="Usuários"
          subtitle="Gerenciamento de usuários administrativos"
        />
      </Route>

      {/* Client routes */}
      <Route path="/client">
        <ProtectedRoute 
          component={ClientDashboard}
          requiredRole="client"
          title="Dashboard"
          subtitle="Sua área de trabalho"
        />
      </Route>
      <Route path="/client/profile">
        <ProtectedRoute 
          component={Profile}
          requiredRole="client"
          title="Perfil"
          subtitle="Informações da empresa"
        />
      </Route>
      <Route path="/client/whatsapp">
        <ProtectedRoute 
          component={WhatsApp}
          requiredRole="client"
          title="WhatsApp"
          subtitle="Gerenciar instâncias"
        />
      </Route>
      <Route path="/client/ai-agents">
        <ProtectedRoute 
          component={AiAgents}
          requiredRole="client"
          title="Agentes IA"
          subtitle="Agentes de IA personalizados"
        />
      </Route>
      <Route path="/client/conversations">
        <ProtectedRoute 
          component={Conversations}
          requiredRole="client"
          title="Conversas"
          subtitle="Histórico de conversas"
        />
      </Route>
      <Route path="/client/whatsapp/disparo">
        <ProtectedRoute 
          component={WhatsAppDisparo}
          requiredRole="client"
          title="Disparo WhatsApp"
          subtitle="Configurar e enviar mensagens em massa"
        />
      </Route>
      <Route path="/client/whatsapp/lista-transmissao">
        <ProtectedRoute 
          component={WhatsAppListaTransmissao}
          requiredRole="client"
          title="Lista de transmissão"
          subtitle="Gerenciar listas de contatos para disparo"
        />
      </Route>
      <Route path="/client/whatsapp/proxy">
        <ProtectedRoute 
          component={WhatsAppProxy}
          requiredRole="client"
          title="Proxies WebShare"
          subtitle="Visualizar proxies disponíveis"
        />
      </Route>
      <Route path="/client/comercial/atendimentos">
        <ProtectedRoute
          component={ComercialAtendimentos}
          requiredRole="client"
          title="Atendimentos"
          subtitle="Gerencie seus clientes no funil"
        />
      </Route>
      <Route path="/client/comercial/leads">
        <ProtectedRoute
          component={ComercialLeads}
          requiredRole="client"
          title="Leads"
          subtitle="Gerencie seus leads e oportunidades"
        />
      </Route>
      <Route path="/client/imoveis/meus-imoveis">
        <ProtectedRoute
          component={MeusImoveis}
          requiredRole="client"
          title="Meus Imóveis"
          subtitle="Gerencie seus imóveis cadastrados"
        />
      </Route>
      <Route path="/client/imoveis/comodidades">
        <ProtectedRoute
          component={Amenities}
          requiredRole="client"
          title="Comodidades"
          subtitle="Gerencie as comodidades dos seus imóveis"
        />
      </Route>
      <Route path="/client/imoveis/cidades">
        <ProtectedRoute
          component={Cities}
          requiredRole="client"
          title="Cidades"
          subtitle="Gerencie as cidades para cadastro de imóveis"
        />
      </Route>
      <Route path="/client/corretores">
        <ProtectedRoute
          component={Brokers}
          requiredRole="client"
          title="Corretores"
          subtitle="Gerencie sua equipe de corretores"
        />
      </Route>
      <Route path="/client/calendario">
        <ProtectedRoute
          component={Calendar}
          requiredRole="client"
          title="Calendario"
          subtitle="Calendario de agendamentos"
        />
      </Route>
      <Route path="/client/domains">
        <ProtectedRoute
          component={Domains}
          requiredRole="client"
          title="Domínio Customizado"
          subtitle="Configure seu domínio personalizado"
        />
      </Route>
      <Route path="/client/website-config">
        <ProtectedRoute
          component={WebsiteConfig}
          requiredRole="client"
          title="Configurar Website"
          subtitle="Personalize o template do seu site"
        />
      </Route>
      <Route path="/client/agents">
        <ProtectedRoute
          component={Agents}
          requiredRole="client"
          title="Corretores"
          subtitle="Gerencie os corretores da sua equipe"
        />
      </Route>
      <Route path="/client/testimonials">
        <ProtectedRoute
          component={Testimonials}
          requiredRole="client"
          title="Depoimentos"
          subtitle="Gerencie os depoimentos de clientes"
        />
      </Route>

      {/* 404 fallback */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
