import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, User, Clock, Phone, Home, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiGet } from '@/lib/api';

interface Broker {
  id: string;
  companyId: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Appointment {
  id: string;
  companyId: string;
  brokerId: string | null;
  propertyId: string | null;
  clientName: string;
  clientPhone: string;
  propertyInterest: string | null;
  scheduledDate: string | null;
  status: string;
  notes: string | null;
  source: string;
  conversationId: string | null;
  createdAt: string;
  updatedAt: string;
}

const DAYS_OF_WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const STATUS_COLORS: Record<string, string> = {
  pendente: 'bg-yellow-500',
  confirmado: 'bg-blue-500',
  realizado: 'bg-green-500',
  cancelado: 'bg-red-500',
};

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  realizado: 'Realizado',
  cancelado: 'Cancelado',
};

export default function Calendar() {
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>('all');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Fetch brokers
  const { data: brokers = [], isLoading: isLoadingBrokers } = useQuery<Broker[]>({
    queryKey: ['brokers'],
    queryFn: async () => {
      return await apiGet('/brokers');
    }
  });

  // Fetch appointments
  const { data: allAppointments = [], isLoading: isLoadingAppointments } = useQuery<Appointment[]>({
    queryKey: ['appointments'],
    queryFn: async () => {
      return await apiGet('/appointments');
    }
  });

  // Filter appointments by selected broker
  const appointments = selectedBrokerId === 'all'
    ? allAppointments
    : allAppointments.filter(a => a.brokerId === selectedBrokerId);

  const selectedBroker = brokers.find(b => b.id === selectedBrokerId);

  // Calendar navigation
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Calculate calendar days
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();

    const days: (number | null)[] = [];

    // Add empty slots for days before the first day of the month
    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }

    // Add the days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    return days;
  };

  // Get appointments for a specific day
  const getAppointmentsForDay = (day: number) => {
    return appointments.filter(apt => {
      // Usar scheduledDate se disponível, senão usar createdAt
      const dateToUse = apt.scheduledDate || apt.createdAt;
      if (!dateToUse) return false;
      const aptDate = new Date(dateToUse);
      return aptDate.getDate() === day &&
        aptDate.getMonth() === currentDate.getMonth() &&
        aptDate.getFullYear() === currentDate.getFullYear();
    });
  };

  // Get broker name by ID
  const getBrokerName = (brokerId: string | null) => {
    if (!brokerId) return 'Nao atribuido';
    const broker = brokers.find(b => b.id === brokerId);
    return broker?.name || 'Corretor desconhecido';
  };

  const days = getDaysInMonth(currentDate);
  const today = new Date();
  const isToday = (day: number) => {
    return (
      day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    );
  };

  if (isLoadingBrokers || isLoadingAppointments) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Calendario</h1>
        </div>
        <Badge variant="secondary">
          {appointments.length} agendamento(s)
        </Badge>
      </div>

      {/* Broker Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="w-5 h-5" />
            Selecionar Corretor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedBrokerId} onValueChange={setSelectedBrokerId}>
            <SelectTrigger className="w-full md:w-[300px]">
              <SelectValue placeholder="Selecione um corretor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os corretores</SelectItem>
              {brokers.map((broker) => (
                <SelectItem key={broker.id} value={broker.id}>
                  {broker.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedBroker && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="font-medium">{selectedBroker.name}</p>
              {selectedBroker.email && (
                <p className="text-sm text-muted-foreground">{selectedBroker.email}</p>
              )}
              {selectedBroker.whatsapp && (
                <p className="text-sm text-muted-foreground">{selectedBroker.whatsapp}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Calendar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToToday}>
                Hoje
              </Button>
              <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={goToNextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Days of week header */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAYS_OF_WEEK.map((day) => (
              <div
                key={day}
                className="text-center text-sm font-medium text-muted-foreground py-2"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, index) => {
              const dayAppointments = day ? getAppointmentsForDay(day) : [];
              return (
                <div
                  key={index}
                  className={`
                    min-h-[100px] p-2 border rounded-lg
                    ${day === null ? 'bg-muted/30' : 'bg-background'}
                    ${day && isToday(day) ? 'border-primary border-2' : 'border-border'}
                  `}
                >
                  {day && (
                    <>
                      <span
                        className={`
                          text-sm font-medium
                          ${isToday(day) ? 'text-primary' : 'text-foreground'}
                        `}
                      >
                        {day}
                      </span>
                      {dayAppointments.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {dayAppointments.slice(0, 2).map((apt) => (
                            <div
                              key={apt.id}
                              className={`text-xs p-1 rounded ${STATUS_COLORS[apt.status] || 'bg-gray-500'} text-white truncate`}
                              title={`${apt.clientName} - ${apt.propertyInterest || 'Sem imovel'}`}
                            >
                              {apt.clientName}
                            </div>
                          ))}
                          {dayAppointments.length > 2 && (
                            <div className="text-xs text-muted-foreground">
                              +{dayAppointments.length - 2} mais
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Appointments List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Agendamentos Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {appointments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum agendamento encontrado
            </p>
          ) : (
            <div className="space-y-4">
              {appointments.slice(0, 10).map((appointment) => (
                <div
                  key={appointment.id}
                  className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{appointment.clientName}</span>
                        <Badge
                          variant="secondary"
                          className={`${STATUS_COLORS[appointment.status] || 'bg-gray-500'} text-white`}
                        >
                          {STATUS_LABELS[appointment.status] || appointment.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="w-4 h-4" />
                        {appointment.clientPhone}
                      </div>
                      {appointment.propertyInterest && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Home className="w-4 h-4" />
                          {appointment.propertyInterest}
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="w-4 h-4" />
                        Corretor: {getBrokerName(appointment.brokerId)}
                      </div>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{new Date(appointment.scheduledDate || appointment.createdAt).toLocaleDateString('pt-BR')}</p>
                      <p className="text-xs">{appointment.source}</p>
                    </div>
                  </div>
                  {appointment.notes && (
                    <p className="mt-2 text-sm text-muted-foreground bg-muted p-2 rounded">
                      {appointment.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
