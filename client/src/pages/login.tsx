import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Erro ao fazer login");
        return;
      }

      if (data.token) {
        localStorage.setItem("lexai_token", data.token);
      }

      window.location.href = "/";
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      data-testid="login-page"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0f2447 0%, #1a365d 50%, #2d4a7a 100%)",
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          margin: "0 20px",
        }}
      >
        <div
          style={{
            textAlign: "center",
            marginBottom: "32px",
          }}
        >
          <h1
            style={{
              fontSize: "28px",
              fontWeight: "700",
              color: "#c9a96e",
              margin: "0 0 4px 0",
              letterSpacing: "2px",
            }}
          >
            Marques & Serra
          </h1>
          <p
            style={{
              fontSize: "12px",
              color: "rgba(201, 169, 110, 0.7)",
              margin: "0 0 24px 0",
              letterSpacing: "3px",
              textTransform: "uppercase",
            }}
          >
            Sociedade de Advogados
          </p>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 16px",
              background: "rgba(201, 169, 110, 0.1)",
              borderRadius: "20px",
              border: "1px solid rgba(201, 169, 110, 0.2)",
            }}
          >
            <span
              style={{
                fontSize: "18px",
                fontWeight: "700",
                color: "#ffffff",
                letterSpacing: "1px",
              }}
            >
              LexAI
            </span>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            background: "rgba(255, 255, 255, 0.05)",
            backdropFilter: "blur(10px)",
            borderRadius: "16px",
            padding: "32px",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
          }}
        >
          {error && (
            <div
              data-testid="text-error"
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "8px",
                padding: "12px 16px",
                marginBottom: "20px",
                color: "#fca5a5",
                fontSize: "14px",
                textAlign: "center",
              }}
            >
              {error}
            </div>
          )}

          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="email"
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: "500",
                color: "rgba(255, 255, 255, 0.7)",
                marginBottom: "8px",
              }}
            >
              Email
            </label>
            <input
              data-testid="input-email"
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "8px",
                color: "#ffffff",
                fontSize: "15px",
                outline: "none",
                transition: "border-color 0.2s",
                boxSizing: "border-box",
              }}
              onFocus={(e) =>
                (e.target.style.borderColor = "rgba(201, 169, 110, 0.5)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "rgba(255, 255, 255, 0.15)")
              }
            />
          </div>

          <div style={{ marginBottom: "28px" }}>
            <label
              htmlFor="password"
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: "500",
                color: "rgba(255, 255, 255, 0.7)",
                marginBottom: "8px",
              }}
            >
              Senha
            </label>
            <input
              data-testid="input-password"
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "8px",
                color: "#ffffff",
                fontSize: "15px",
                outline: "none",
                transition: "border-color 0.2s",
                boxSizing: "border-box",
              }}
              onFocus={(e) =>
                (e.target.style.borderColor = "rgba(201, 169, 110, 0.5)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "rgba(255, 255, 255, 0.15)")
              }
            />
          </div>

          <button
            data-testid="button-login"
            type="submit"
            disabled={isLoading}
            style={{
              width: "100%",
              padding: "14px",
              background: isLoading
                ? "rgba(201, 169, 110, 0.5)"
                : "linear-gradient(135deg, #c9a96e 0%, #b8943d 100%)",
              border: "none",
              borderRadius: "8px",
              color: "#1a365d",
              fontSize: "15px",
              fontWeight: "700",
              cursor: isLoading ? "not-allowed" : "pointer",
              transition: "opacity 0.2s",
              letterSpacing: "0.5px",
            }}
          >
            {isLoading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p
          style={{
            textAlign: "center",
            marginTop: "24px",
            fontSize: "12px",
            color: "rgba(255, 255, 255, 0.3)",
          }}
        >
          © 2024 LexAI — Plataforma Jurídica Inteligente
        </p>
      </div>
    </div>
  );
}
