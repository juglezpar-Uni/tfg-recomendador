"""
Genera las gráficas de la evaluación experimental del motor de reglas
a partir de los CSV producidos por el benchmark
(src/experiments/benchmark/).

Salidas (en la misma carpeta que este script):
  - fig_latencia_lineas.png   Latencia media vs nTR con banda IC 95 %
  - fig_latencia_barras.png   Barras agrupadas con barras de error IC 95 %
  - fig_desviacion.png        Desviación típica vs nTR

Uso:
    pip install -r requirements.txt
    python plot_results.py
"""

from pathlib import Path
import sys

import matplotlib.pyplot as plt
import pandas as pd

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent

# Los CSV se generan por PowerShell (adb logcat > archivo.csv) y salen en
# UTF-16 LE con BOM.  Pandas lo lee sin problema con encoding='utf-16'.
CSV_ENCODING = "utf-16"

SUMMARIES = {
    "siddhi": BASE_DIR / "siddhi_summary.csv",
    "js": BASE_DIR / "js_summary.csv",
}

# Colores fijos por motor para que las tres figuras sean coherentes.
COLORS = {
    "siddhi": "#d95f02",  # naranja
    "js": "#1b9e77",      # verde
}

LABELS = {
    "siddhi": "Siddhi (nativo)",
    "js": "JavaScript",
}


# ---------------------------------------------------------------------------
# Carga
# ---------------------------------------------------------------------------

def load_summary(path: Path) -> pd.DataFrame:
    """Carga un CSV de resumen y lo ordena por nTR para asegurar el trazo."""
    if not path.exists():
        raise FileNotFoundError(f"No se encuentra {path}")
    df = pd.read_csv(path, encoding=CSV_ENCODING)
    return df.sort_values("nTR").reset_index(drop=True)


def load_all() -> dict[str, pd.DataFrame]:
    return {engine: load_summary(path) for engine, path in SUMMARIES.items()}


# ---------------------------------------------------------------------------
# Figuras
# ---------------------------------------------------------------------------

def plot_lines_with_ci(data: dict[str, pd.DataFrame], out: Path) -> None:
    """(a) Líneas de latencia media vs nTR + banda sombreada del IC 95 %."""
    fig, ax = plt.subplots(figsize=(8, 5))

    for engine, df in data.items():
        color = COLORS[engine]
        ax.plot(
            df["nTR"], df["mean_ms"],
            marker="o", linewidth=2,
            color=color, label=LABELS[engine],
        )
        ax.fill_between(
            df["nTR"], df["ci95_low_ms"], df["ci95_high_ms"],
            color=color, alpha=0.18,
        )

    ax.set_xlabel("Número de reglas de disparo (nTR)")
    ax.set_ylabel("Latencia media (ms)")
    ax.set_title(
        "Latencia media de evaluación frente al número de reglas\n"
        "(banda sombreada: intervalo de confianza al 95 %)"
    )
    ax.grid(True, alpha=0.3)
    ax.legend()

    fig.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)
    print(f"  -> {out.name}")


def plot_grouped_bars(data: dict[str, pd.DataFrame], out: Path) -> None:
    """(b) Barras agrupadas de latencia media con barras de error IC 95 %."""
    fig, ax = plt.subplots(figsize=(9, 5))

    # Todos los nTR presentes en cualquiera de los dos DataFrames.
    nTRs = sorted(
        set(data["siddhi"]["nTR"]).union(set(data["js"]["nTR"]))
    )
    x_positions = range(len(nTRs))
    bar_width = 0.4

    for i, (engine, df) in enumerate(data.items()):
        # Alinear el DataFrame con la lista global de nTR (por si faltase alguno).
        aligned = df.set_index("nTR").reindex(nTRs)
        means = aligned["mean_ms"].values
        # yerr asimétrico: distancias del medio a los extremos del IC.
        err_low = means - aligned["ci95_low_ms"].values
        err_high = aligned["ci95_high_ms"].values - means

        offsets = [x + (i - 0.5) * bar_width for x in x_positions]
        ax.bar(
            offsets, means,
            width=bar_width,
            color=COLORS[engine],
            label=LABELS[engine],
            yerr=[err_low, err_high],
            capsize=3,
            edgecolor="white",
        )

    ax.set_xticks(list(x_positions))
    ax.set_xticklabels([str(n) for n in nTRs])
    ax.set_xlabel("Número de reglas de disparo (nTR)")
    ax.set_ylabel("Latencia media (ms)")
    ax.set_title("Latencia media por motor (barras de error: IC 95 %)")
    ax.grid(True, axis="y", alpha=0.3)
    ax.legend()

    fig.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)
    print(f"  -> {out.name}")


def plot_std(data: dict[str, pd.DataFrame], out: Path) -> None:
    """(c) Desviación típica vs nTR — refleja la estabilidad de cada motor."""
    fig, ax = plt.subplots(figsize=(8, 5))

    for engine, df in data.items():
        ax.plot(
            df["nTR"], df["std_ms"],
            marker="s", linewidth=2,
            color=COLORS[engine], label=LABELS[engine],
        )

    ax.set_xlabel("Número de reglas de disparo (nTR)")
    ax.set_ylabel("Desviación típica (ms)")
    ax.set_title(
        "Desviación típica de la latencia por motor\n"
        "(mide la estabilidad entre repeticiones)"
    )
    ax.grid(True, alpha=0.3)
    ax.legend()

    fig.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)
    print(f"  -> {out.name}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    print("Cargando resultados...")
    try:
        data = load_all()
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    for engine, df in data.items():
        print(
            f"  {engine}: {len(df)} niveles, "
            f"nTR de {df['nTR'].min()} a {df['nTR'].max()}"
        )

    print("Generando figuras...")
    plot_lines_with_ci(data, BASE_DIR / "fig_latencia_lineas.png")
    plot_grouped_bars(data, BASE_DIR / "fig_latencia_barras.png")
    plot_std(data, BASE_DIR / "fig_desviacion.png")

    print("Hecho.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
