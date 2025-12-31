import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Building, Settings, Waypoints, Bot, Users,
  LayoutDashboard, User, MessageSquare,
  MessageCircle, LogOut, ChevronDown, ChevronRight, Send, List, Globe, Home, UserPlus, Sparkles, MapPin, CreditCard, Calendar
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlobalConfiguration } from "@/types";
import { useState } from "react";

interface NavItem {
  href?: string;
  label: string;
  icon: React.ReactNode;
  children?: NavItem[];
}

const adminNavItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
  { href: "/admin/configurations", label: "Configurações", icon: <Settings className="w-5 h-5" /> },
  { href: "/admin/evolution-api", label: "Evolution API", icon: <Waypoints className="w-5 h-5" /> },
  { href: "/admin/ai-settings", label: "IA Global", icon: <Bot className="w-5 h-5" /> },
  { href: "/admin/companies", label: "Empresas", icon: <Building className="w-5 h-5" /> },
  { href: "/admin/plans", label: "Planos", icon: <CreditCard className="w-5 h-5" /> },
  { href: "/admin/custom-domains", label: "Domínios Customizados", icon: <Globe className="w-5 h-5" /> },
];

const clientNavItems: NavItem[] = [
  { href: "/client", label: "Dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
  { 
    label: "WhatsApp", 
    icon: <MessageSquare className="w-5 h-5" />,
    children: [
      { href: "/client/whatsapp", label: "Números conectados", icon: <MessageSquare className="w-4 h-4" /> },
      { href: "/client/whatsapp/disparo", label: "Disparo", icon: <Send className="w-4 h-4" /> },
      { href: "/client/whatsapp/lista-transmissao", label: "Lista de transmissão", icon: <List className="w-4 h-4" /> },
    ]
  },
  {
    label: "Comercial",
    icon: <Building className="w-5 h-5" />,
    children: [
      { href: "/client/comercial/atendimentos", label: "Atendimentos", icon: <Users className="w-4 h-4" /> },
      { href: "/client/comercial/leads", label: "Leads", icon: <UserPlus className="w-4 h-4" /> },
    ]
  },
  {
    label: "Imóveis",
    icon: <Home className="w-5 h-5" />,
    children: [
      { href: "/client/imoveis/meus-imoveis", label: "Meus Imóveis", icon: <Home className="w-4 h-4" /> },
      { href: "/client/imoveis/comodidades", label: "Comodidades", icon: <Sparkles className="w-4 h-4" /> },
      { href: "/client/imoveis/cidades", label: "Cidades", icon: <MapPin className="w-4 h-4" /> },
    ]
  },
  { href: "/client/corretores", label: "Corretores", icon: <User className="w-5 h-5" /> },
  { href: "/client/calendario", label: "Calendario", icon: <Calendar className="w-5 h-5" /> },
  {
    label: "Website",
    icon: <Globe className="w-5 h-5" />,
    children: [
      { href: "/client/website-config", label: "Configurar Website", icon: <Settings className="w-4 h-4" /> },
      { href: "/client/agents", label: "Corretores", icon: <Users className="w-4 h-4" /> },
      { href: "/client/testimonials", label: "Depoimentos", icon: <MessageSquare className="w-4 h-4" /> },
    ]
  },
  { href: "/client/ai-agents", label: "Agentes IA", icon: <Bot className="w-5 h-5" /> },
  { href: "/client/domains", label: "Domínio Customizado", icon: <Globe className="w-5 h-5" /> },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const { config } = useTheme();
  const [location] = useLocation();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]); // Todos os menus começam fechados

  const toggleMenu = (menuLabel: string) => {
    setExpandedMenus(prev => 
      prev.includes(menuLabel) 
        ? prev.filter(label => label !== menuLabel)
        : [...prev, menuLabel]
    );
  };

  const { data: globalConfig } = useQuery<Partial<GlobalConfiguration>>({
    queryKey: ["/global-config/public"],
    queryFn: () => fetch("/api/global-config/public", {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`
      }
    }).then(res => res.json()),
    enabled: !!user
  });

  if (!user) return null;

  const navItems = user.role === "admin" ? adminNavItems : clientNavItems;
  const isAdmin = user.role === "admin";

  return (
    <div className="fixed inset-y-0 left-0 w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo Section */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center justify-center">
          {globalConfig?.logo ? (
            <img 
              src={globalConfig.logo} 
              alt="Logo" 
              className="h-12 w-auto object-contain"
            />
          ) : (
            <div className="w-12 h-12 bg-sidebar-primary rounded-lg flex items-center justify-center">
              <Building className="text-sidebar-primary-foreground text-xl" />
            </div>
          )}
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {navItems.map((item) => {
          if (item.children) {
            const isExpanded = expandedMenus.includes(item.label);
            const hasActiveChild = item.children.some(child => child.href === location);
            
            return (
              <div key={item.label}>
                {/* Parent Menu Item */}
                <div
                  onClick={() => toggleMenu(item.label)}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer",
                    hasActiveChild || isExpanded
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <div className="flex items-center">
                    {item.icon}
                    <span className="ml-3">{item.label}</span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </div>
                
                {/* Submenu Items */}
                {isExpanded && (
                  <div className="ml-6 mt-1 space-y-1">
                    {item.children.map((child) => {
                      const isActive = location === child.href;
                      return (
                        <Link key={child.href} href={child.href!}>
                          <div
                            className={cn(
                              "flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                              isActive
                                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            )}
                          >
                            {child.icon}
                            <span className="ml-3">{child.label}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          } else {
            // Regular menu item without children
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href!}>
                <div
                  className={cn(
                    "flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  {item.icon}
                  <span className="ml-3">{item.label}</span>
                </div>
              </Link>
            );
          }
        })}
      </nav>

      {/* User Info */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center space-x-3">
          <Avatar className="w-8 h-8">
            <AvatarImage src="" />
            <AvatarFallback>
              <User className="w-4 h-4" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            {!isAdmin ? (
              <Link href="/client/profile">
                <p className="text-sm font-medium text-sidebar-foreground truncate hover:text-sidebar-accent-foreground cursor-pointer">
                  {user.email}
                </p>
              </Link>
            ) : (
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user.email}
              </p>
            )}
            <p className="text-xs text-muted-foreground truncate">
              {user.role === "admin" ? "Administrador" : "Cliente"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
