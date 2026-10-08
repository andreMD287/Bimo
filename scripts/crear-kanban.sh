#!/usr/bin/env bash
# Crea los issues T01–T16 del incremento 1 (docs/specs/08 §6) y los agrega a un proyecto de GitHub.
#
# Requisitos:
#   - gh CLI con sesión iniciada:      gh auth login
#   - Permiso para proyectos:           gh auth refresh -s project
#
# Uso:
#   bash scripts/crear-kanban.sh <dueño-del-proyecto> <número-del-proyecto>
#   Ejemplo: bash scripts/crear-kanban.sh andreMD287 3
#   (el número es el que aparece en la URL: github.com/users/andreMD287/projects/3)
#
# Se puede correr varias veces: si un issue con ese título ya existe, no lo duplica.
# Compatible con el bash 3.2 que trae macOS.

set -euo pipefail

REPO="andreMD287/Bimo"
OWNER="${1:-}"
PROJECT="${2:-}"
if [[ -z "$OWNER" || -z "$PROJECT" ]]; then
  echo "Uso: $0 <dueño-del-proyecto> <número-del-proyecto>" >&2
  exit 1
fi

SPEC_BASE="https://github.com/$REPO/blob/main/docs/specs"

# ---------- Etiquetas ----------
crear_etiqueta() { # nombre color descripción
  gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force >/dev/null
}
echo "Creando etiquetas..."
crear_etiqueta "inc-1"      "0e8a16" "Incremento 1 (MVP bootcamp)"
crear_etiqueta "contratos"  "5319e7" "Contratos Soroban"
crear_etiqueta "core"       "1d76db" "bimo-core (TypeScript)"
crear_etiqueta "db"         "006b75" "Supabase / Postgres"
crear_etiqueta "ios"        "d93f0b" "App iOS"
crear_etiqueta "web"        "fbca04" "Web de verificación"
crear_etiqueta "infra"      "bfd4f2" "Repo, CI, despliegues"
crear_etiqueta "riesgo-alto" "b60205" "Toca piezas externas no probadas: hacer temprano"

# ---------- Datos de las tareas ----------
# Índices 1..16 = T01..T16. Dependencias como lista de índices separados por espacio.
TITULO=(); SPECS=(); DEPS=(); LISTO=(); RESP=(); ETQ=(); DESC=()

TITULO[1]="Esqueleto del monorepo, CLAUDE.md y CI con el job specs"
DESC[1]="Crear la estructura de carpetas del spec 08 §1, dejar CLAUDE.md activo y una CI que corra node docs/specs/02-check.mjs."
SPECS[1]="08"; DEPS[1]=""; LISTO[1]="CI en verde en main."; RESP[1]="André"; ETQ[1]="inc-1,infra"

TITULO[2]="Migraciones de Supabase"
DESC[2]="Tablas, enums, índices, triggers DB-01..DB-12, vista account_balances y RLS."
SPECS[2]="01"; DEPS[2]="1"; LISTO[2]="Todos los criterios de aceptación del spec 01 en verde."; RESP[2]="Santiago"; ETQ[2]="inc-1,db"

TITULO[3]="Librería canónica y Merkle + validaciones V-01..V-11 en TypeScript"
DESC[3]="Portar docs/specs/02-referencia.mjs a core, crear shared/validation-cases.json e implementar V-01..V-11."
SPECS[3]="02 04"; DEPS[3]="1"; LISTO[3]="Vectores del spec 02 y casos compartidos en verde."; RESP[3]="Santiago"; ETQ[3]="inc-1,core"

TITULO[4]="Contratos p256-verifier y registry con pruebas"
DESC[4]="Implementar los contratos del spec 03 §2 y §4 con soroban-sdk testutils y los vectores P-256."
SPECS[4]="03"; DEPS[4]="1"; LISTO[4]="Criterios de verificador y registry del spec 03 §10 en verde."; RESP[4]="André"; ETQ[4]="inc-1,contratos,riesgo-alto"

TITULO[5]="Despliegue en testnet, cuentas de Bimo y deployments/testnet.json"
DESC[5]="Desplegar verificador y registry; crear admin (multifirma 2 de 3), attester y deployer; versionar el JSON del spec 03 §9."
SPECS[5]="03"; DEPS[5]="4"; LISTO[5]="Contratos desplegados en testnet y contracts/deployments/testnet.json en el repo."; RESP[5]="André"; ETQ[5]="inc-1,contratos,riesgo-alto"

TITULO[6]="core: autenticación, comercios, dispositivos y despliegue de bimo-account"
DESC[6]="JWT de Supabase, POST /merchants, reto y POST /devices, worker que despliega la smart account de OpenZeppelin."
SPECS[6]="03 06 07"; DEPS[6]="2 5"; LISTO[6]="Una bimo-account creada en testnet con una llave de software."; RESP[6]="André"; ETQ[6]="inc-1,core,contratos,riesgo-alto"

TITULO[7]="core: sincronización (push y pull)"
DESC[7]="Endpoints del spec 06 §3.2 con las reglas del spec 04 §4–§8."
SPECS[7]="04 06"; DEPS[7]="2 3"; LISTO[7]="Criterios del spec 04 del lado del servidor en verde."; RESP[7]="Santiago"; ETQ[7]="inc-1,core"

TITULO[8]="core: cierre, solicitudes de firma, envío, confirmación y enmiendas"
DESC[8]="Transiciones D, S y L del spec 07, flujo de firma del spec 03 §5 y puerto Enviador."
SPECS[8]="03 06 07"; DEPS[8]="6 7"; LISTO[8]="Transiciones del spec 07 en verde y el día de ejemplo del spec 02 sellado en testnet."; RESP[8]="André"; ETQ[8]="inc-1,core,contratos,riesgo-alto"

TITULO[9]="core: indexador, TTL, conciliador y simuladores /dev"
DESC[9]="Workers de la iteración 5 y simuladores del spec 06 §3.7 que crean asientos verificados por el inbox."
SPECS[9]="03 06 07"; DEPS[9]="8"; LISTO[9]="Eventos indexados y simuladores creando asientos verificados."; RESP[9]="Santiago"; ETQ[9]="inc-1,core"

TITULO[10]="core: enlaces y API pública de verificación"
DESC[10]="POST/GET/DELETE /verification-links y GET /public/verification con el paquete del spec 05 §3."
SPECS[10]="05 06"; DEPS[10]="8"; LISTO[10]="El paquete del spec 05 sale correcto para el día de ejemplo."; RESP[10]="Santiago"; ETQ[10]="inc-1,core"

TITULO[11]="Web de verificación y cli/verify.mjs"
DESC[11]="Página estática que lee Stellar directo y recalcula en el navegador, más el script para verificar sin la web."
SPECS[11]="05"; DEPS[11]="10"; LISTO[11]="Criterios de aceptación del spec 05 en verde."; RESP[11]="Lizeth"; ETQ[11]="inc-1,web"

TITULO[12]="iOS: BimoDomain (modelos, ULID, V-01..V-11) y BimoStore (GRDB)"
DESC[12]="Paquetes Swift con el modelo, las reglas compartidas y la base local del spec 04 §2."
SPECS[12]="01 04"; DEPS[12]="3"; LISTO[12]="shared/validation-cases.json en verde en Swift."; RESP[12]="André (lógica) · Lizeth (UI)"; ETQ[12]="inc-1,ios"

TITULO[13]="iOS: BimoSigner, onboarding y verificación del firmante"
DESC[13]="Firmante del Secure Enclave y de software con Face ID; crear cuenta y comprobar el firmante leyendo RPC."
SPECS[13]="03"; DEPS[13]="6 12"; LISTO[13]="Cuenta creada desde el simulador y firmante verificado por RPC."; RESP[13]="André"; ETQ[13]="inc-1,ios,riesgo-alto"

TITULO[14]="iOS: registrar venta, Hoy, fiado, sincronización y cierre"
DESC[14]="Pantallas principales y el módulo sync del spec 04, con los cálculos de Hoy del §9."
SPECS[14]="04 07"; DEPS[14]="7 12"; LISTO[14]="Criterios del spec 04 del lado de la app en verde."; RESP[14]="Lizeth (UI) · André"; ETQ[14]="inc-1,ios"

TITULO[15]="iOS: pantalla de firma, enlaces y Ventas por revisar"
DESC[15]="Validar la preimagen, mostrar el resumen y pedir Face ID; compartir enlaces; listar asientos rechazados."
SPECS[15]="03 05 07"; DEPS[15]="8 13 14"; LISTO[15]="Flujo completo desde el iPhone: vender, cerrar, firmar y compartir."; RESP[15]="André · Lizeth (UI)"; ETQ[15]="inc-1,ios"

TITULO[16]="Ensayo de la demo del bootcamp"
DESC[16]="Correr el guion del spec 08 §7 de punta a punta y ajustar lo que falle."
SPECS[16]="01 02 03 04 05 06 07 08"; DEPS[16]="9 11 15"; LISTO[16]="Demo completa sin intervención manual."; RESP[16]="Todo el equipo"; ETQ[16]="inc-1,infra"

ARCHIVO_SPEC() {
  case "$1" in
    01) echo "01-modelo-de-datos.md" ;;
    02) echo "02-formato-canonico-y-merkle.md" ;;
    03) echo "03-contratos-soroban.md" ;;
    04) echo "04-sincronizacion.md" ;;
    05) echo "05-enlace-de-verificacion.md" ;;
    06) echo "06-api.md" ;;
    07) echo "07-maquinas-de-estado.md" ;;
    08) echo "08-repo-stack-pruebas-y-plan.md" ;;
  esac
}

# ---------- Creación ----------
NUM=()   # número de issue de cada tarea
for i in $(seq 1 16); do
  ID=$(printf "T%02d" "$i")
  TITLE="$ID · ${TITULO[$i]}"

  EXISTENTE=$(gh issue list --repo "$REPO" --state all --search "\"$ID ·\" in:title" --json number,title \
              --jq ".[] | select(.title | startswith(\"$ID ·\")) | .number" | head -n1)
  if [[ -n "$EXISTENTE" ]]; then
    NUM[$i]="$EXISTENTE"
    echo "$ID ya existe (#$EXISTENTE), se omite."
  else
    LINEAS_SPECS=""
    for s in ${SPECS[$i]}; do
      LINEAS_SPECS="$LINEAS_SPECS- [Spec $s]($SPEC_BASE/$(ARCHIVO_SPEC "$s"))"$'\n'
    done
    LINEAS_DEPS=""
    if [[ -z "${DEPS[$i]}" ]]; then
      LINEAS_DEPS="- Ninguna"$'\n'
    else
      for d in ${DEPS[$i]}; do
        LINEAS_DEPS="$LINEAS_DEPS- [ ] #${NUM[$d]} ($(printf "T%02d" "$d"))"$'\n'
      done
    fi

    BODY="## Objetivo
${DESC[$i]}

## Specs a seguir
${LINEAS_SPECS}
Antes de empezar: leer [CLAUDE.md](https://github.com/$REPO/blob/main/CLAUDE.md) y el [índice de specs]($SPEC_BASE/README.md).

## Depende de
${LINEAS_DEPS}
## Listo cuando
- [ ] ${LISTO[$i]}
- [ ] Cada criterio de aceptación tocado tiene su prueba, con el ID en el nombre.
- [ ] CI en verde.

## Responsable sugerido
${RESP[$i]}

## Instrucción para Claude Code
> Implementa la tarea $ID de \`docs/specs/08-repo-stack-pruebas-y-plan.md\` siguiendo los specs indicados y \`CLAUDE.md\`. No inventes nada fuera de los specs; si falta algo, detente y pregunta."

    URL=$(gh issue create --repo "$REPO" --title "$TITLE" --body "$BODY" --label "${ETQ[$i]}")
    NUM[$i]="${URL##*/}"
    echo "$ID creado: $URL"
  fi

  gh project item-add "$PROJECT" --owner "$OWNER" \
     --url "https://github.com/$REPO/issues/${NUM[$i]}" >/dev/null 2>&1 || true
done

echo
echo "Listo: 16 tareas en https://github.com/$REPO/issues y en el proyecto $PROJECT de $OWNER."
echo "Sugerencia: en el tablero, agrupa por etiqueta o por 'Responsable' para ver las tres líneas en paralelo."
