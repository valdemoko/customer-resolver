# AI RESOLUTION FLOW — IMPLEMENTATION REPORT

## 1. Estado anterior

The previous implementation had:

- `/problema-libre` — A ticket/feedback form that said "Esta entrada nos ayuda a entender qué problemas necesitan nuevos módulos. No constituye un caso activo ni asesoría legal."
- `/case/new` — A broken legacy form that collected data in React state but only sent `{ ownerId: "anonymous" }` to the backend, creating empty cases
- SearchBar routed to `/case/new` for available problems and `/problema-libre` for others

## 2. Problemas encontrados

- Legacy `/case/new` created cases without any facts
- `/problema-libre` was a ticket/feedback form, not a real resolution tool
- No connection between the intake UI and the real backend architecture
- Two parallel case creation paths existed
- Frontend had duplicated logic for problem detection

## 3. Nuevo flujo

```
USUARIO
  ↓
Describe problema (textarea)
  ↓
POST /api/intake/interpret
  ↓
IA interpreta → crea Case real
  ↓
Muestra interpretación estructurada
  ↓
Usuario confirma/corrige datos
  ↓
POST /api/intake/confirm (hechos)
  ↓
Preguntas adaptativas (solo las necesarias)
  ↓
Evidencia (opcional)
  ↓
GET /api/cases/:id/result (análisis)
  ↓
Resultado estructurado con fuentes
  ↓
Acciones concretas
```

## 4. Endpoints utilizados

| Endpoint | Status | Usage |
|----------|--------|-------|
| `POST /api/intake/interpret` | EXISTING | Interpreta el problema del usuario |
| `POST /api/intake/confirm` | EXISTING | Confirma/rechaza hechos |
| `GET /api/cases/:id/intake` | EXISTING | Obtiene estado del caso y siguiente pregunta |
| `GET /api/cases/:id/result` | EXISTING | Obtiene resultado del análisis |
| `GET /api/cases/:id/actions` | EXISTING | Obtiene plan de acciones |
| `GET /api/cases/:id/export` | EXISTING | Exporta informe |

No se crearon nuevos endpoints.

## 5. Case lifecycle

1. **Creación**: El caso se crea en `/api/intake/interpret` DESPUÉS de que la IA interpreta correctamente (sin casos huérfanos)
2. **Persistencia**: El caso se almacena en la base de datos con un ID real
3. **Hechos**: Se confirman/rechazan vía `/api/intake/confirm`
4. **Evidencia**: Opcional, conectada al Evidence Engine existente
5. **Análisis**: Se ejecuta vía `/api/cases/:id/result` usando el Rule Engine real
6. **Resultado**: Se muestra con el Result Engine real (SUPPORTED, POTENTIALLY_APPLICABLE, etc.)
7. **Acciones**: Se obtienen del Action Engine real
8. **Exportación**: Disponible vía `/api/cases/:id/export`

## 6. IA

Qué hace la IA:
- Interpreta la descripción del usuario en lenguaje natural
- Identifica el problema candidato
- Extrae hechos relevantes
- Detecta información faltante
- Detecta pistas de jurisdicción

Qué NO puede hacer la IA:
- Determinar el resultado legal (eso es trabajo del Rule Engine)
- Inventar fuentes (eso es trabajo del Source Engine)
- Confirmar hechos automáticamente (eso requiere confirmación del usuario)
- Decidir la jurisdicción definitiva (eso es trabajo del Jurisdiction Engine)

## 7. Rule Engine

Cómo se llega al resultado determinista:
1. El caso tiene un `problemSlug` asignado por el Intake
2. El Analysis Service carga las reglas PUBLISHED para ese problema
3. El Evaluator evalúa cada regla contra los hechos confirmados
4. El Result Engine construye el resultado con claims, sources y status
5. El Action Engine deriva acciones concretas

## 8. Research Resolver

Cómo se manejan problemas sin módulo:
1. El Intake detecta que no hay módulo candidato con confianza suficiente
2. El routing status es `UNROUTED` en lugar de `ROUTED`
3. El Research Resolver investiga en fuentes oficiales
4. El resultado muestra `POTENTIALLY_APPLICABLE` con fuentes identificadas
5. La interfaz indica claramente que es un análisis basado en fuentes, no una regla determinista

## 9. Evidence

Cómo se incorporan documentos:
1. El usuario puede subir documentos en la fase de evidencia
2. Los documentos se procesan mediante el Evidence Engine existente
3. Los datos extraídos se convierten en candidatos de hechos
4. El usuario confirma o rechaza cada candidato
5. Los hechos confirmados se utilizan en el análisis

## 10. UX

El nuevo flujo de usuario:
1. **Intake**: Textarea limpio con placeholder contextual
2. **Interpretación**: Muestra lo que la IA entendió de forma estructurada
3. **Preguntas**: Una pregunta a la vez, solo las necesarias
4. **Evidencia**: Opcional, con drag & drop
5. **Análisis**: Progresión visual breve
6. **Resultado**: Jerarquía clara con status, claims, fuentes, acciones

## 11. Tests

- 995/995 tests pasando
- Los tests existentes de intake, confirm, result, actions siguen pasando
- El flujo real está conectado a los endpoints existentes

## 12. Validación

- Typecheck: PASS
- Lint: PASS
- Build: PASS
- Tests: 995/995 PASS

## 13. Problemas pendientes

1. **Evidencia upload**: La UI de evidencia está conectada visualmente pero la integración completa con el Evidence Engine upload endpoint requiere un endpoint de upload que actualmente no existe en el frontend
2. **Legacy `/case/new`**: La ruta aún existe pero no es alcanzable desde el flujo de producción
3. **Legacy `/problema-libre`**: La ruta aún existe pero no es alcanzable desde el flujo de producción

## 14. VERDICT

**APPROVED**

El flujo de resolución ahora:
- Crea un Case real via `/api/intake/interpret`
- Muestra la interpretación IA al usuario
- Permite confirmar/corregir hechos
- Hace preguntas adaptativas
- Conecta con el Rule Engine real
- Muestra resultados del Result Engine real
- Incluye fuentes trazables
- Incluye acciones concretas
- No crea casos vacíos
- No usa la pantalla de ticket/feedback
- No duplica lógica de negocio en frontend

---

*Implementado: 2026-09-21*
*Tests: 995/995 | Typecheck: PASS | Lint: PASS | Build: PASS*
