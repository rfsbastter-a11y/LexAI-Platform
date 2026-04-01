import { Moon, Monitor, Sun, Palette } from "lucide-react";
import { useTheme } from "next-themes";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ThemeMode = "light" | "dark" | "system";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  const activeTheme = (theme || "system") as ThemeMode;

  const options: Array<{
    value: ThemeMode;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      value: "light",
      label: "Claro",
      description: "Visual claro para uso durante o dia.",
      icon: Sun,
    },
    {
      value: "dark",
      label: "Escuro",
      description: "Visual escuro para reduzir o brilho da tela.",
      icon: Moon,
    },
    {
      value: "system",
      label: "Sistema",
      description: "Segue automaticamente o tema do seu computador.",
      icon: Monitor,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Configurações</h1>
          <p className="text-muted-foreground mt-1">Ajustes rápidos do seu ambiente.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Aparência</CardTitle>
            <CardDescription>Escolha como a interface será exibida.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {options.map((option) => {
              const Icon = option.icon;
              const isActive = activeTheme === option.value;

              return (
                <Button
                  key={option.value}
                  type="button"
                  variant={isActive ? "default" : "outline"}
                  className="h-auto w-full justify-start p-4 text-left"
                  onClick={() => setTheme(option.value)}
                  data-testid={`theme-option-${option.value}`}
                >
                  <div className="flex items-start gap-3">
                    <Icon className="h-4 w-4 mt-0.5" />
                    <div>
                      <p className="font-medium">{option.label}</p>
                      <p className="text-xs opacity-80 mt-1">{option.description}</p>
                    </div>
                  </div>
                </Button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              Pré-visualização do tema
            </CardTitle>
            <CardDescription>
              Bloco de teste para conferir contraste e leitura no modo escuro.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">Texto principal (alto contraste)</p>
              <p className="text-sm text-muted-foreground">
                Texto secundário para observações e descrições.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                  Ação principal
                </span>
                <span className="rounded-md border border-border bg-background px-2 py-1 text-xs">
                  Ação secundária
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
