import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ClientStats, DashboardCharts } from "@/types";
import { MessageSquare, Users, Calendar as CalendarIcon, TrendingUp, TrendingDown, ChevronRight, Home } from "lucide-react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";

interface MetricCardProps {
  title: string;
  value: number;
  percentChange: number;
  icon: React.ReactNode;
  iconBgColor: string;
  iconColor: string;
  periodLabel?: string;
}

function MetricCard({ title, value, percentChange, icon, iconBgColor, iconColor, periodLabel }: MetricCardProps) {
  const isPositive = percentChange >= 0;

  return (
    <Card className="border border-gray-100 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{value.toLocaleString('pt-BR')}</p>
            <div className="flex items-center mt-2">
              {isPositive ? (
                <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
              )}
              <span className={`text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                {isPositive ? '+' : ''}{percentChange}% {periodLabel || 'vs ontem'}
              </span>
            </div>
          </div>
          <div className={`p-3 rounded-xl ${iconBgColor}`}>
            <div className={iconColor}>
              {icon}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const chartConfig = {
  agendadas: {
    label: "Reuniões Agendadas",
    color: "#22c55e",
  },
} satisfies ChartConfig;

interface AppointmentsChartProps {
  data: Array<{ day: string; agendadas: number }>;
}

function AppointmentsChart({ data }: AppointmentsChartProps) {
  return (
    <Card className="border border-gray-100 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-semibold">Reuniões Agendadas</CardTitle>
          <p className="text-sm text-gray-500">Período selecionado</p>
        </div>
        <button className="flex items-center text-sm text-green-600 hover:text-green-700">
          Ver Detalhes
          <ChevronRight className="w-4 h-4 ml-1" />
        </button>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[250px] flex items-center justify-center">
            <p className="text-sm text-gray-500">Nenhum dado disponível</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <BarChart data={data}>
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: '#6b7280' }}
                interval={Math.max(0, Math.floor(data.length / 7) - 1)}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: '#6b7280' }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="agendadas"
                fill="var(--color-agendadas)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
        <div className="flex items-center justify-center mt-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-green-500"></div>
            <span className="text-sm text-gray-600">Reuniões Agendadas</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface RankingItemProps {
  rank: number;
  name: string;
  value: number;
  maxValue: number;
}

function RankingItem({ rank, name, value, maxValue }: RankingItemProps) {
  const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
        {rank}
      </div>
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-medium text-gray-700">{name}</span>
          <span className="text-sm font-semibold text-gray-900">{value.toLocaleString('pt-BR')}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}

interface PropertyTypesChartProps {
  data: Array<{ rank: number; name: string; value: number }>;
}

function PropertyTypesChart({ data }: PropertyTypesChartProps) {
  const maxValue = data.length > 0 ? Math.max(...data.map(item => item.value)) : 0;

  return (
    <Card className="border border-gray-100 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Home className="w-5 h-5 text-blue-500" />
          <CardTitle className="text-base font-semibold">Tipos de Imóveis Mais Buscados</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">Nenhum dado disponível</p>
        ) : (
          <div className="space-y-1">
            {data.map((item) => (
              <RankingItem
                key={item.rank}
                rank={item.rank}
                name={item.name}
                value={item.value}
                maxValue={maxValue}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface TransactionDemandChartProps {
  data: Array<{ rank: number; name: string; value: number }>;
}

function TransactionDemandChart({ data }: TransactionDemandChartProps) {
  const maxValue = data.length > 0 ? Math.max(...data.map(item => item.value)) : 0;

  return (
    <Card className="border border-gray-100 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-500" />
          <CardTitle className="text-base font-semibold">Demanda por Tipo de Transação</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">Nenhum dado disponível</p>
        ) : (
          <div className="space-y-1">
            {data.map((item) => (
              <RankingItem
                key={item.rank}
                rank={item.rank}
                name={item.name}
                value={item.value}
                maxValue={maxValue}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DateRangePicker({
  dateRange,
  onDateRangeChange
}: {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
}) {
  const [open, setOpen] = useState(false);

  const formatDateRange = () => {
    if (!dateRange?.from) return "Selecionar período";

    if (dateRange.to) {
      // Check if it's today only
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const from = new Date(dateRange.from);
      from.setHours(0, 0, 0, 0);
      const to = new Date(dateRange.to);
      to.setHours(0, 0, 0, 0);

      if (from.getTime() === today.getTime() && to.getTime() === today.getTime()) {
        return "Hoje";
      }

      return `${format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })} - ${format(dateRange.to, "dd/MM/yyyy", { locale: ptBR })}`;
    }

    return format(dateRange.from, "dd/MM/yyyy", { locale: ptBR });
  };

  const setToday = () => {
    const today = new Date();
    onDateRangeChange({ from: today, to: today });
    setOpen(false);
  };

  const setLast7Days = () => {
    const today = new Date();
    const last7 = new Date();
    last7.setDate(last7.getDate() - 6);
    onDateRangeChange({ from: last7, to: today });
    setOpen(false);
  };

  const setLast30Days = () => {
    const today = new Date();
    const last30 = new Date();
    last30.setDate(last30.getDate() - 29);
    onDateRangeChange({ from: last30, to: today });
    setOpen(false);
  };

  const setThisMonth = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    onDateRangeChange({ from: firstDay, to: today });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-w-[200px] justify-start text-left font-normal">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {formatDateRange()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex">
          <div className="border-r p-2 space-y-1">
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={setToday}>
              Hoje
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={setLast7Days}>
              Últimos 7 dias
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={setLast30Days}>
              Últimos 30 dias
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={setThisMonth}>
              Este mês
            </Button>
          </div>
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={onDateRangeChange}
            numberOfMonths={2}
            locale={ptBR}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function ClientDashboard() {
  // Default to today
  const today = new Date();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: today,
    to: today
  });

  // Format dates for API
  const startDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : format(today, "yyyy-MM-dd");
  const endDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : startDate;

  const { data: stats, isLoading: statsLoading } = useQuery<ClientStats>({
    queryKey: ["/api/client/stats", { startDate, endDate }],
  });

  const { data: charts } = useQuery<DashboardCharts>({
    queryKey: ["/api/client/dashboard-charts", { startDate, endDate }],
  });

  // Determine period label for comparison
  const getPeriodLabel = () => {
    if (!dateRange?.from || !dateRange?.to) return "vs período anterior";

    const from = new Date(dateRange.from);
    const to = new Date(dateRange.to);
    const todayDate = new Date();

    from.setHours(0, 0, 0, 0);
    to.setHours(0, 0, 0, 0);
    todayDate.setHours(0, 0, 0, 0);

    if (from.getTime() === todayDate.getTime() && to.getTime() === todayDate.getTime()) {
      return "vs ontem";
    }

    return "vs período anterior";
  };

  if (statsLoading) {
    return <div>Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header with Date Filter */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Leads"
          value={stats?.leadsToday?.value || 0}
          percentChange={stats?.leadsToday?.change || 0}
          icon={<Users className="w-5 h-5" />}
          iconBgColor="bg-green-50"
          iconColor="text-green-500"
          periodLabel={getPeriodLabel()}
        />
        <MetricCard
          title="Reuniões Agendadas"
          value={stats?.scheduledMeetings?.value || 0}
          percentChange={stats?.scheduledMeetings?.change || 0}
          icon={<CalendarIcon className="w-5 h-5" />}
          iconBgColor="bg-green-50"
          iconColor="text-green-500"
          periodLabel={getPeriodLabel()}
        />
        <MetricCard
          title="Conversas"
          value={stats?.conversationsToday?.value || 0}
          percentChange={stats?.conversationsToday?.change || 0}
          icon={<MessageSquare className="w-5 h-5" />}
          iconBgColor="bg-green-50"
          iconColor="text-green-500"
          periodLabel={getPeriodLabel()}
        />
      </div>

      {/* Appointments Chart */}
      <AppointmentsChart data={[]} />

      {/* Property Types and Transaction Demand Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PropertyTypesChart data={charts?.propertyTypes || []} />
        <TransactionDemandChart data={charts?.transactionTypes || []} />
      </div>
    </div>
  );
}
