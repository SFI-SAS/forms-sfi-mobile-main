/**
 * FormDataAdapter.ts
 * Adaptador que convierte datos de endpoints PC a estructura móvil
 * Maneja conversión de form_design + questions a formStructure unificada
 */

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
    | "image";
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

      // 🔗 Si es tipo "select" y question_type es "table", obtener correlaciones
      if (item.type === "select" && question.question_type === "table") {
        console.log(
          `🌐 [FormDataAdapter] Select ${item.id} es tipo TABLE - Obteniendo opciones desde endpoint...`
        );

        try {
          // Usar función existente de api.js
          const { getTableCorrelations } = await import("../services/api");
          const data = await getTableCorrelations(questionId);

          console.log(
            `📊 [FormDataAdapter] Respuesta del endpoint para questionId ${questionId}:`,
            data
          );

          // Extraer opciones del endpoint
          const respuestas = Array.isArray(data.data) ? data.data : [];
          const options = respuestas.map((r: any) => r.name);

          // Guardar correlaciones si existen
          if (data.correlations) {
            Object.assign(correlations, data.correlations);
            console.log(
              `🔗 [FormDataAdapter] Correlaciones guardadas para questionId ${questionId}`
            );
          }

          console.log(
            `✅ [FormDataAdapter] Opciones extraídas (TABLE): ${options.join(", ")}`
          );

          enrichedProps = {
            label: item.props?.label || question.question_text,
            required: item.props?.required ?? question.is_required,
            placeholder: item.props?.placeholder || question.placeholder,
            options: options, // 👈 Opciones del endpoint
            relatedAnswers: question.related_answers,
            sourceQuestionId: item.props?.sourceQuestionId || questionId,
            dataSource: "table_endpoint",
            questionType: "table",
            optionsSource: "endpoint", // Para debug
            ...item.props,
          };
        } catch (error) {
          console.error(
            `❌ [FormDataAdapter] Error obteniendo datos para questionId ${questionId}:`,
            error
          );
          // Fallback a opciones existentes
          enrichedProps = {
            label: item.props?.label || question.question_text,
            required: item.props?.required ?? question.is_required,
            placeholder: item.props?.placeholder || question.placeholder,
            options: item.props?.options || question.options, // Fallback a opciones del form_design
            relatedAnswers: question.related_answers,
            sourceQuestionId: item.props?.sourceQuestionId,
            dataSource: "form_design",
            questionType: question.question_type,
            optionsSource: "fallback", // Para debug
            error: "Error al cargar opciones desde el servidor",
            ...item.props,
          };
        }
      } else {
        // ✅ CASO 2: NO es tipo TABLE → Usar opciones del form_design
        console.log(
          `📝 [FormDataAdapter] Question tipo "${question.question_type}" - Usando opciones del form_design`
        );

        const formDesignOptions = item.props?.options || question.options || [];

        console.log(
          `✅ [FormDataAdapter] Opciones del form_design: ${formDesignOptions.join(", ")}`
        );

        // Para otros tipos, lógica normal
        enrichedProps = {
          label: item.props?.label || question.question_text,
          required: item.props?.required ?? question.is_required,
          placeholder: item.props?.placeholder || question.placeholder,
          options: formDesignOptions, // 👈 Opciones del form_design
          relatedAnswers: question.related_answers,
          sourceQuestionId: item.props?.sourceQuestionId,
          dataSource: "form_design",
          questionType: question.question_type,
          optionsSource: "form_design", // Para debug
          ...item.props, // Props de form_design tienen prioridad final
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
