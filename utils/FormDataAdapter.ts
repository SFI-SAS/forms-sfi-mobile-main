/**
 * FormDataAdapter.ts
 * Adaptador que convierte datos de endpoints PC a estructura móvil
 * Maneja conversión de form_design + questions a formStructure unificada
 */

import {
  getTableCorrelations,
  getMathOperationsByQuestions,
} from "../services/api";

export interface FormItem {
  id: string;
  type:
    | "input"
    | "select"
    | "textarea"
    | "date"
    | "time"
    | "datetime"
    | "number"
    | "checkbox"
    | "radio"
    | "file"
    | "firm"
    | "regisfacial"
    | "location"
    | "repeater"
    | "vertical-layout"
    | "horizontal-layout"
    | "label"
    | "help-text"
    | "divider"
    | "button"
    | "image"
    | "mathoperations";
  props: {
    label?: string;
    placeholder?: string;
    required?: boolean;
    options?: string[];
    relatedAnswers?: any[];
    minItems?: number;
    maxItems?: number;
    addButtonText?: string;
    allowCurrentLocation?: boolean;
    rows?: number;
    fontSize?: string;
    fontWeight?: string;
    color?: string;
    align?: string;
    text?: string;
    thickness?: number;
    buttonType?: string;
    fullWidth?: boolean;
    src?: string;
    alt?: string;
    mode?: "register" | "validate" | "sign";
    tableStyle?: any;
    sourceQuestionId?: string; // Para correlaciones bidireccionales
    dataSource?: "table_endpoint" | "form_design"; // Para debug
    questionType?: string; // Tipo de question del backend
    optionsSource?: "endpoint" | "form_design" | "fallback"; // Para debug
    error?: string; // Mensaje de error si falla carga
    code?: string; // Para mathoperations: expresión matemática con {questionId}
    mathExpression?: string; // Para mathoperations: alias de code
    descriptionValue?: string; // Para FileField: valor de la descripción (usado por repeater)
    onDescriptionChange?: (desc: string) => void; // Para FileField: handler del cambio de descripción (usado por repeater)
    fieldType?: string; // Tipo de validación del campo (number, email, phone, etc)
    type?: string; // Alias para fieldType
  };
  children?: FormItem[];
  questionId?: number;
  form_design_element_id?: string;
}

export interface Question {
  id: number;
  question_text: string;
  question_type: string;
  is_required: boolean;
  related_answers?: any[];
  placeholder?: string;
  options?: string[];
  [key: string]: any;
}

export interface FormDesign {
  type: string;
  props: any;
  id: string;
  children?: FormDesign[];
}

export interface EnrichedFormData {
  formStructure: FormItem[];
  questions: Question[];
  correlations: Record<string, Record<string, string>>;
  styleConfig: any;
  metadata: {
    formId: number;
    title: string;
    description: string;
  };
}

/**
 * Enriquece form_design con datos de questions
 * Ahora incluye lógica async para obtener correlaciones de endpoints
 */
export async function enrichFormDesign(
  formDesign: any,
  questions: Question[]
): Promise<{ formStructure: FormItem[]; correlations: Record<string, any> }> {
  const questionsMap = questions.reduce(
    (map, q) => {
      map[q.id] = q;
      return map;
    },
    {} as Record<number, Question>
  );

  const correlations: Record<string, any> = {};

  const enrichItem = async (item: any): Promise<FormItem | null> => {
    // ✅ NUEVA ESTRATEGIA (100% PC):
    // Renderizar TODO directamente desde form_design
    // item.props ya contiene: label, options, required, placeholder, etc.

    // Mapear tipo de form_design a tipo de componente móvil
    const componentType = mapFormDesignTypeToComponent(item.type);

    if (!componentType) {
      console.warn(`⚠️ Tipo de item no soportado: ${item.type}`, item);
      return null;
    }

    // Extraer questionId si existe (tolerando typos del backend)
    const questionId =
      item.questionId ||
      item.id_question ||
      item.id_queestion ||
      item.linkExternalId ||
      item.llinkExternalId;

    // Enriquecer props con datos de questions si existe questionId
    let enrichedProps = { ...item.props };

    if (questionId && questionsMap[questionId]) {
      const question = questionsMap[questionId];

      // Determinar el tipo efectivo del componente
      const formDesignType = item.type; // Lo que dice form_design
      const questionType = question.question_type; // Lo que dice question-table-relation

      console.log(
        `🔍 [FormDataAdapter] Procesando ${item.id}: form_design="${formDesignType}", question_type="${questionType}"`
      );

      // 🎯 REGLA DE PRIORIDAD ABSOLUTA:
      // Si question_type === "table" → SIEMPRE usar endpoint question-table-relation
      // (sin importar lo que diga form_design)
      // Si question_type !== "table" → Usar form_design

      if (questionType === "table") {
        // ✅ PRIORIDAD ABSOLUTA: question_type="table" → SIEMPRE usar endpoint
        console.log(
          `🌐 [FormDataAdapter] ⚡ PRIORIDAD ABSOLUTA: question_type="table" → Consultando endpoint question-table-relation...`
        );

        try {
          // Endpoint: GET /questions/question-table-relation/answers/{question_id}
          const data = await getTableCorrelations(questionId);

          // 🔥 LOG COMPLETO DE LA RESPUESTA DEL ENDPOINT
          console.log(`
═══════════════════════════════════════════════════════════
📊 RESPUESTA COMPLETA question-table-relation para questionId ${questionId}
═══════════════════════════════════════════════════════════
🔹 Campo: ${item.id}
🔹 Label: ${question.question_text}
🔹 Data completa del endpoint:
${JSON.stringify(data, null, 2)}
═══════════════════════════════════════════════════════════
          `);

          // Extraer opciones del endpoint (campo "name" del array "data")
          const respuestas = Array.isArray(data.data) ? data.data : [];
          const options = respuestas.map((r: any) => r.name);

          console.log(`
📋 OPCIONES EXTRAÍDAS:
   Total: ${options.length}
   Opciones: ${JSON.stringify(options, null, 2)}
          `);

          // Guardar correlaciones si existen
          if (data.correlations) {
            Object.assign(correlations, data.correlations);
            console.log(`
🔗 CORRELACIONES GUARDADAS:
   Keys: ${JSON.stringify(Object.keys(data.correlations), null, 2)}
   Correlaciones completas: ${JSON.stringify(data.correlations, null, 2)}
            `);
          }

          console.log(
            `✅ [FormDataAdapter] ${options.length} opciones extraídas del endpoint: ${options.slice(0, 3).join(", ")}${options.length > 3 ? "..." : ""}`
          );

          enrichedProps = {
            ...item.props, // 👈 Valores viejos PRIMERO
            label: item.props?.label || question.question_text,
            required: item.props?.required ?? question.is_required,
            placeholder: item.props?.placeholder || question.placeholder,
            options: options, // 👈 SOBREESCRIBE con datos FRESCOS del endpoint (aunque esté vacío)
            relatedAnswers: question.related_answers,
            sourceQuestionId: item.props?.sourceQuestionId || questionId,
            dataSource: "table_endpoint", // Indica origen de los datos
            questionType: "table",
            optionsSource: "endpoint", // Para debug
          };
        } catch (error) {
          console.error(
            `❌ [FormDataAdapter] Error obteniendo datos del endpoint para questionId ${questionId}:`,
            error
          );

          // 🔥 NUNCA usar fallback de form_design para campos tipo "table"
          // Si falla el endpoint, dejar opciones vacías
          console.warn(
            `⚠️ [FormDataAdapter] Tipo "table" - NO se usará fallback de form_design. Opciones: []`
          );

          enrichedProps = {
            ...item.props, // 👈 Valores viejos PRIMERO
            label: item.props?.label || question.question_text,
            required: item.props?.required ?? question.is_required,
            placeholder: item.props?.placeholder || question.placeholder,
            options: [], // 👈 SOBREESCRIBE con array VACÍO (NO fallback)
            relatedAnswers: question.related_answers,
            sourceQuestionId: item.props?.sourceQuestionId,
            dataSource: "table_endpoint",
            questionType: "table",
            optionsSource: "endpoint_failed", // Para debug
            error: "Error al cargar opciones desde el servidor",
          };
        }
      } else {
        // ✅ NO es tipo "table" → Usar form_design normalmente
        console.log(
          `📝 [FormDataAdapter] Question tipo "${questionType}" → Usando form_design`
        );

        const formDesignOptions = item.props?.options || question.options || [];

        console.log(
          `✅ [FormDataAdapter] ${formDesignOptions.length} opciones de form_design`
        );

        enrichedProps = {
          ...item.props, // 👈 Valores viejos PRIMERO
          label: item.props?.label || question.question_text,
          required: item.props?.required ?? question.is_required,
          placeholder: item.props?.placeholder || question.placeholder,
          options: formDesignOptions, // 👈 SOBREESCRIBE con datos de form_design
          relatedAnswers: question.related_answers,
          sourceQuestionId: item.props?.sourceQuestionId,
          dataSource: "form_design",
          questionType: questionType,
          optionsSource: "form_design", // Para debug
        };
      }
    }

    const enrichedItem: FormItem = {
      id: item.id,
      type: componentType,
      questionId: questionId,
      form_design_element_id: item.id,
      props: enrichedProps,
      children: item.children
        ? await Promise.all(item.children.map(enrichItem).filter(Boolean))
        : [],
    };

    return enrichedItem;
  };

  const formStructure = Array.isArray(formDesign)
    ? await Promise.all(formDesign.map(enrichItem))
    : [await enrichItem(formDesign)];

  return {
    formStructure: formStructure.filter(Boolean) as FormItem[],
    correlations,
  };
}

/**
 * Mapea tipos de pregunta de backend a tipos de componente
 */
function mapQuestionTypeToComponent(questionType: string): FormItem["type"] {
  const typeMap: Record<string, FormItem["type"]> = {
    text: "input",
    input: "input",
    textarea: "textarea",
    select: "select",
    dropdown: "select",
    radio: "radio",
    checkbox: "checkbox",
    date: "date",
    time: "time",
    datetime: "datetime",
    number: "number",
    file: "file",
    firm: "firm",
    regisfacial: "regisfacial",
    location: "location",
    repeater: "repeater",
    mathoperations: "mathoperations",
  };

  return typeMap[questionType.toLowerCase()] || "input";
}

/**
 * ✅ NUEVO: Mapea tipos de form_design (PC) a tipos de componente móvil
 * Esta función permite renderizar TODOS los tipos que vienen en form_design
 */
function mapFormDesignTypeToComponent(
  designType: string
): FormItem["type"] | null {
  const typeMap: Record<string, FormItem["type"]> = {
    // Campos de formulario
    input: "input",
    textarea: "textarea",
    select: "select",
    date: "date",
    time: "time",
    datetime: "datetime",
    number: "number",
    checkbox: "checkbox",
    radio: "radio",
    file: "file",

    // Campos especiales
    firm: "firm",
    regisfacial: "regisfacial",
    location: "location",
    mathoperations: "mathoperations",

    // Layouts
    repeater: "repeater",
    verticalLayout: "vertical-layout",
    horizontalLayout: "horizontal-layout",
    "vertical-layout": "vertical-layout",
    "horizontal-layout": "horizontal-layout",

    // Elementos visuales
    label: "label",
    "help-text": "help-text",
    divider: "divider",
    button: "button",
    image: "image",
  };

  return typeMap[designType] || null;
}

/**
 * Extrae styleConfig de form_design
 */
export function extractStyleConfig(formDesign: any): any | null {
  if (!formDesign) return null;

  if (Array.isArray(formDesign)) {
    for (const item of formDesign) {
      if (item.props?.styleConfig) return item.props.styleConfig;
      if (item.headerTable && !item.type) return item;
    }
  }

  if (typeof formDesign === "object") {
    if (formDesign.styleConfig) return formDesign.styleConfig;
    if (formDesign.headerTable && !formDesign.type) return formDesign;
  }

  return null;
}

/**
 * Filtra items innecesarios del form_design
 */
export function filterFormItems(formDesign: any[]): any[] {
  if (!Array.isArray(formDesign)) return [];

  return formDesign.filter((item) => {
    // Mantener solo items con type válido
    if (!item.type) return false;

    // Excluir configuraciones que no son campos visuales
    if (item.type === "config" || item.type === "style") return false;

    return true;
  });
}

/**
 * Limpia styleConfig de items para evitar duplicación
 */
export function cleanStyleConfigFromItems(formItems: any[]): any[] {
  return formItems.map((item) => {
    const cleaned = { ...item };
    if (cleaned.props?.styleConfig) {
      delete cleaned.props.styleConfig;
    }
    if (cleaned.children) {
      cleaned.children = cleanStyleConfigFromItems(cleaned.children);
    }
    return cleaned;
  });
}

/**
 * Procesa form_design + questions y retorna estructura completa
 */
export async function processFormData(
  formDesign: any,
  questions: Question[],
  formId: number,
  formTitle: string,
  formDescription: string
): Promise<EnrichedFormData> {
  console.log("📦 [FormDataAdapter] Procesando datos del formulario...");

  // 1. Extraer styleConfig
  const styleConfig = extractStyleConfig(formDesign);

  // 2. Filtrar items válidos
  const filteredItems = filterFormItems(
    Array.isArray(formDesign) ? formDesign : [formDesign]
  );

  // 3. Limpiar styleConfig de items
  const cleanedItems = cleanStyleConfigFromItems(filteredItems);

  // 4. Enriquecer con questions (ahora async para obtener correlaciones)
  const { formStructure, correlations } = await enrichFormDesign(
    cleanedItems,
    questions
  );

  console.log(`✅ [FormDataAdapter] Procesados ${formStructure.length} items`);

  // 5. 🆕 Enriquecer campos mathoperations con sus expresiones matemáticas
  try {
    // Identificar questionIds de campos mathoperations
    const mathOperationQuestionIds: number[] = [];
    const traverseForMathOps = (items: typeof formStructure) => {
      items.forEach((item) => {
        if (item.type === "mathoperations" && item.questionId) {
          mathOperationQuestionIds.push(item.questionId);
        }
        if (item.children) {
          traverseForMathOps(item.children);
        }
      });
    };
    traverseForMathOps(formStructure);

    if (mathOperationQuestionIds.length > 0) {
      console.log(
        `📐 [FormDataAdapter] Obteniendo operaciones para ${mathOperationQuestionIds.length} campos: ${mathOperationQuestionIds.join(", ")}`
      );

      const mathOpsData = await getMathOperationsByQuestions(
        formId,
        mathOperationQuestionIds
      );

      if (
        mathOpsData.found &&
        mathOpsData.operations &&
        mathOpsData.operations.length > 0
      ) {
        console.log(
          `✅ [FormDataAdapter] ${mathOpsData.operations.length} operaciones matemáticas encontradas`
        );
        console.log(
          "📊 [FormDataAdapter] Operaciones:",
          JSON.stringify(mathOpsData.operations, null, 2)
        );

        // Crear mapa de questionId -> operation
        const operationsMap: Record<number, string> = {};
        mathOpsData.operations.forEach((op: any) => {
          // Cada operación puede tener múltiples id_questions
          // La operación se aplica a todas esas preguntas
          if (Array.isArray(op.id_questions) && op.operations) {
            op.id_questions.forEach((qId: number) => {
              operationsMap[qId] = op.operations;
            });
          }
        });

        // Aplicar operaciones a los campos mathoperations
        const applyMathOps = (items: typeof formStructure) => {
          items.forEach((item) => {
            if (
              item.type === "mathoperations" &&
              item.questionId &&
              operationsMap[item.questionId]
            ) {
              item.props.code = operationsMap[item.questionId];
              console.log(
                `✅ [FormDataAdapter] Operación aplicada a campo ${item.id} (question ${item.questionId}): ${item.props.code}`
              );
            }
            if (item.children) {
              applyMathOps(item.children);
            }
          });
        };
        applyMathOps(formStructure);
      } else {
        console.warn(
          "⚠️ [FormDataAdapter] No se encontraron operaciones matemáticas en el backend"
        );
      }
    }
  } catch (error) {
    console.error(
      "❌ [FormDataAdapter] Error obteniendo operaciones matemáticas:",
      error
    );
    // No bloquear si falla - continuar sin las operaciones
  }

  return {
    formStructure,
    questions,
    correlations,
    styleConfig,
    metadata: {
      formId,
      title: formTitle,
      description: formDescription,
    },
  };
}

/**
 * Serializa datos para guardar en AsyncStorage
 */
export function serializeForStorage(data: EnrichedFormData): string {
  return JSON.stringify(data);
}

/**
 * Deserializa datos desde AsyncStorage
 */
export function deserializeFromStorage(
  jsonString: string
): EnrichedFormData | null {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("❌ Error deserializando datos:", error);
    return null;
  }
}
