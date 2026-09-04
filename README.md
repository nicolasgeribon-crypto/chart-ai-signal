# Chart AI Signal V14

V14 parte de V13 y mantiene la estrategia de entradas por retroceso.

## Cambio principal
La Martingala 1 selectiva compara más filtros y los elige **solo** usando desarrollo + confirmación.

Objetivo primario:
- neto teórico positivo;
- drawdown máximo <= 8 unidades;
- racha máxima <= 2 ciclos perdidos.

Si ningún candidato cumple esos límites en desarrollo+confirmación, V14 usa un nivel relajado (DD <= 10 y racha <= 3) y, si tampoco existe, aplica una selección ajustada por riesgo.

El 30% final permanece fuera de muestra y **no se usa para escoger el filtro**. Allí únicamente se mide qué ocurrió con la política ya elegida.

La interfaz muestra:
- ciclos y acierto MG1;
- neto teórico;
- drawdown máximo;
- racha máxima de pérdidas;
- cantidad de MG1 utilizadas;
- ranking de candidatos seleccionado sin mirar la prueba final.

Simulación educativa/histórica con supuesto de pago 1:1: 1 unidad inicial y 2 unidades en MG1.
No garantiza resultados futuros ni ejecuta operaciones.
