# Evaluación experimental — motor de reglas Siddhi vs JavaScript

Este directorio contiene todo el material de la evaluación de rendimiento
comparando el motor de reglas nativo **Siddhi** (Kotlin, R-Rules original)
con el motor **JavaScript** desarrollado en el Sprint 3, para que los
experimentos sean reproducibles.

## Contenido

| Archivo | Descripción |
| --- | --- |
| `siddhi_summary.csv` | Resultados agregados del motor Siddhi: una fila por nivel de reglas con media, desviación típica, IC 95 %, percentiles. |
| `siddhi_per_rep.csv` | Media por repetición del motor Siddhi (una fila por combinación de nTR y repetición). |
| `js_summary.csv` | Idem `siddhi_summary.csv`, para el motor JavaScript. |
| `js_per_rep.csv` | Idem `siddhi_per_rep.csv`, para el motor JavaScript. |
| `plot_results.py` | Script que lee los cuatro CSV anteriores y genera las figuras. |
| `requirements.txt` | Dependencias Python del script. |
| `fig_latencia_lineas.png` | (Generada) Latencia media vs nTR con banda del IC 95 %. |
| `fig_latencia_barras.png` | (Generada) Barras agrupadas de latencia media con barras de error IC 95 %. |
| `fig_desviacion.png` | (Generada) Desviación típica vs nTR — estabilidad entre repeticiones. |

## Formato de los CSV

Los CSV se generan directamente desde `adb logcat` filtrado por los
prefijos `[BENCH_CSV]` (agregado por nivel) y `[BENCH_REP]` (por
repetición). PowerShell los guarda en **UTF-16 LE con BOM**; el script
Python los lee con `encoding="utf-16"`.

**`*_summary.csv`** — una fila por nivel de nTR:

```
engine,nTR,n_reps,mean_ms,std_ms,var_ms2,ci95_low_ms,ci95_high_ms,min_ms,max_ms,p50_ms,p95_ms
```

- `mean_ms` — media de las medias por repetición (n = `n_reps`).
- `std_ms`, `var_ms2` — desviación típica y varianza sobre las
  `n_reps` medias.
- `ci95_low_ms`, `ci95_high_ms` — intervalo de confianza al 95 %
  calculado con la **t de Student** (t = 2.262 para n = 10).
- `min_ms`, `max_ms`, `p50_ms`, `p95_ms` — estadísticos sobre el pool
  de todas las muestras individuales de todas las repeticiones
  (`n_reps × samples` valores, 500 para la configuración por defecto).

**`*_per_rep.csv`** — una fila por (engine, nTR, rep):

```
engine,nTR,rep,mean_ms
```

Útil para bootstrap, gráficas de dispersión entre repeticiones o
diagnóstico de anomalías puntuales.

## Cómo se generaron los datos

- **Dispositivo**: Samsung Galaxy A35 (físico, no emulador).
- **Configuración del benchmark** (`benchmarkHarness.js`):
  - **9 niveles** de reglas de disparo (nTR): 10, 20, 30, 50, 80, 100,
    120, 150, 200 — los mismos que la Figura 10 del artículo original
    de R-Rules (ESWA 2024).
  - **10 repeticiones** completas del barrido de niveles.
  - **50 muestras** medidas por nivel por repetición (500 individuales
    por nivel; 4 500 en total por motor).
  - **Warm-up global de 30 eventos** contra un ruleset de nTR = 50
    antes de la primera medición (evita el sesgo del cold start).
  - **Warm-up local**: los primeros 10 eventos de cada nivel también
    se descartan.
  - **Reglas sintéticas de coincidencia uniforme** — cada CR sintética
    encaja con cada contexto y cada TR se dispara para cada evento
    (peor caso, sin poda de ramas).
  - **Determinismo**: sin RNG. Reglas y contextos son funciones puras
    del índice, así que ambos motores ven exactamente los mismos
    inputs en cada repetición.
- **Métrica**:
  - Motor JS: latencia síncrona pura de `RuleEngine.evaluateSync()`
    (parse JSON + evaluación de todas las CRs + evaluación de todas
    las TRs, todo en el hilo JS).
  - Motor Siddhi: round-trip completo `sendEvent` → callback
    FinalResults (puente RN JS → nativo, evaluación CEP, log sink,
    puente nativo → JS). Se usa una app Siddhi **idéntica a la de
    producción menos la ventana `timeBatch(7 sec)`** para que
    `getResult()` retorne inmediatamente tras la evaluación.
  - Diferencia inherente: la cifra de Siddhi incluye la sobrecarga
    del puente, que es una constante fija del "usar Siddhi desde una
    app JS". El escalado con nTR es lo comparable directamente.

## Cómo reejecutar el benchmark

Los detalles completos están en
[`../../src/experiments/benchmark/README.md`](../../src/experiments/benchmark/README.md).
Resumen operativo:

1. **Preparar la app**:
   - En [`App.js`](../../App.js), comentar temporalmente
     `startContextSending()` y `startRecommendationPolling()` para
     evitar ruido de fondo durante las mediciones.
   - En [`src/screens/Loading.js`](../../src/screens/Loading.js#L132)
     (dentro de `prepareSession`), añadir:
     ```js
     import {runBenchmark} from '../experiments/benchmark';
     // ...tras bootstrapRecommendationBridge() y checkEMAvailability():
     setTimeout(() => {
       runBenchmark().catch(err => console.error('[bench] failed:', err));
     }, 15000);
     ```

2. **Fijar el motor** en Realm (por consola de Metro o desde un fichero
   temporal):
   ```js
   storeParameter('*', 'SETTINGS', 'RULE_ENGINE', 'siddhi'); // o 'js'
   ```

3. **Lanzar la app** y esperar al log `[bench] === runBenchmark finished ===`.
   Tiempo total aproximado con 10 repeticiones:
   - Siddhi: ~10 min (dominado por el settle time y el puente nativo).
   - JS: ~6 min (JS puro, sin puente).

4. **Capturar los CSV** desde PowerShell:
   ```powershell
   # Motor Siddhi
   adb logcat -s ReactNativeJS:V | Select-String '\[BENCH_CSV\]'  > siddhi_summary.csv
   adb logcat -s ReactNativeJS:V | Select-String '\[BENCH_REP\]'  > siddhi_per_rep.csv

   # Motor JS (tras cambiar el flag y reiniciar la app)
   adb logcat -s ReactNativeJS:V | Select-String '\[BENCH_CSV\]'  > js_summary.csv
   adb logcat -s ReactNativeJS:V | Select-String '\[BENCH_REP\]'  > js_per_rep.csv
   ```

5. **Mover los CSV** a esta carpeta, sobrescribiendo los anteriores si
   los hay:
   ```powershell
   Move-Item *_summary.csv,*_per_rep.csv docs\evaluacion\ -Force
   ```

6. **Restaurar** los cambios en `Loading.js` y `App.js`.

## Cómo regenerar las gráficas

```bash
pip install -r requirements.txt
python plot_results.py
```

El script escribe los tres PNG (`fig_latencia_lineas.png`,
`fig_latencia_barras.png`, `fig_desviacion.png`) en esta misma carpeta
y no modifica los CSV.

## Notas sobre la interpretación

- La comparación **motor a motor** no debe leerse como "Siddhi es más
  lento": la cifra de Siddhi incluye una sobrecarga fija del puente
  React Native que no se puede eliminar sin instrumentar el módulo
  nativo. Lo relevante es el **escalado con nTR** y la **estabilidad
  (desviación típica)**.
- El motor JS ejecuta todo en el hilo JS y no atraviesa el puente, por
  lo que su banda de confianza es notablemente más estrecha.
