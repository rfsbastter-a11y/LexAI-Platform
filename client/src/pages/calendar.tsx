import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { MOCK_CASES } from "@/lib/mock-data";

export default function CalendarPage() {
  const [date, setDate] = useState<Date | undefined>(new Date());

  // Simple filter for deadlines (mock logic)
  const deadlines = MOCK_CASES.filter(c => c.nextDeadline);

  return (
    <DashboardLayout>
      <div className="flex flex-col md:flex-row gap-8">
        <div className="flex-1 space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary">Agenda Jurídica</h1>
            <p className="text-muted-foreground mt-1">Controle de prazos, audiências e compromissos.</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Prazos do Dia</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {deadlines.length > 0 ? (
                  deadlines.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                      <div>
                        <p className="font-medium">{item.title}</p>
                        <p className="text-sm text-muted-foreground">{item.court}</p>
                      </div>
                      <div className="text-right">
                         <Badge variant="destructive">Vencimento Hoje</Badge>
                         <p className="text-xs text-muted-foreground mt-1">{new Date(item.nextDeadline!).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">Nenhum prazo urgente para hoje.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="w-full md:w-[350px]">
           <Card>
             <CardContent className="p-4 flex justify-center">
               <Calendar
                 mode="single"
                 selected={date}
                 onSelect={setDate}
                 className="rounded-md border shadow-sm"
               />
             </CardContent>
           </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
