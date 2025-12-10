/**
 * ResponseAdapter.ts
 * Adaptador para envío de respuestas usando la lógica de PC (2 pasos)
 * 1. POST /responses/save-response → obtener response_id
 * 2. POST /responses/save-answers (por cada respuesta)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export interface FormResponse {
  question_id: number;
  response: string | object;
  file_path: string;
  form_design_element_id: string;
  repeated_id?: string;
}

export interface SaveAnswerPayload {
  question_id: number;
  answer_text: string;
  file_path: string;
  response_id: number;
  relation_bitacora_id?: number;
  form_design_element_id: string;
  repeated_id?: string;
}

/**
 * Convierte valores del formulario a formato de respuesta
 */
export function convertFormValuesToResponses(
  formValues: Record<string, any>,
  formStructure: any[]
): FormResponse[] {
  const responses: FormResponse[] = [];

  const processItem = (item: any, parentRepeatedId?: string) => {
    // Si es un layout, procesar sus hijos
    if (item.type === "vertical-layout" || item.type === "horizontal-layout") {
      item.children?.forEach((child: any) =>
        processItem(child, parentRepeatedId)
      );
      return;
    }

    // Si es un repeater, procesar cada fila
    if (item.type === "repeater") {
      const repeaterValues = formValues[item.id];
      if (Array.isArray(repeaterValues)) {
        repeaterValues.forEach((rowValues, rowIndex) => {
          const repeatedId = `${item.id}_row_${rowIndex}`;
          item.children?.forEach((child: any) => {
            const childValue = rowValues[child.id];
            if (
              childValue !== undefined &&
              childValue !== null &&
              childValue !== ""
            ) {
              responses.push({
                question_id: child.questionId,
                response:
                  typeof childValue === "object"
                    ? childValue
                    : String(childValue),
                file_path: "",
                form_design_element_id: child.id,
                repeated_id: repeatedId,
              });
            }
          });
        });
      }
      return;
    }

    // Si es un campo con questionId
    if (item.questionId) {
      const value = formValues[item.id];

      if (value !== undefined && value !== null && value !== "") {
        responses.push({
          question_id: item.questionId,
          response: typeof value === "object" ? value : String(value),
          file_path: "", // Se llenará después si es archivo
          form_design_element_id: item.id,
          repeated_id: parentRepeatedId,
        });
      }
    }

    // Procesar hijos si los tiene
    item.children?.forEach((child: any) =>
      processItem(child, parentRepeatedId)
    );
  };

  formStructure.forEach((item) => processItem(item));

  return responses;
}

/**
 * Valida que las respuestas cumplan con los requisitos
 */
export function validateResponses(
  responses: FormResponse[],
  formStructure: any[]
): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const validateItem = (item: any) => {
    if (item.props?.required && item.questionId) {
      const hasResponse = responses.some(
        (r) =>
          r.question_id === item.questionId &&
          r.response !== "" &&
          r.response !== null
      );

      if (!hasResponse) {
        errors[item.id] =
          `El campo "${item.props.label || "sin nombre"}" es obligatorio`;
      }
    }

    // Validar hijos recursivamente
    if (item.children) {
      item.children.forEach(validateItem);
    }

    // Validar repeaters
    if (item.type === "repeater" && item.props?.minItems) {
      const repeaterResponses = responses.filter((r) =>
        r.repeated_id?.startsWith(item.id)
      );

      const uniqueRows = new Set(repeaterResponses.map((r) => r.repeated_id))
        .size;

      if (uniqueRows < item.props.minItems) {
        errors[item.id] =
          `Se requieren al menos ${item.props.minItems} registros`;
      }
    }
  };

  formStructure.forEach(validateItem);

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Paso 1: Guarda la respuesta inicial y obtiene response_id
 */
export async function saveResponseInitial(
  formId: number,
  responses: FormResponse[],
  action: "send" | "send_and_close" = "send"
): Promise<{ response_id: number; relation_bitacora_id?: number }> {
  const token = await AsyncStorage.getItem("authToken");
  const backendUrl = await AsyncStorage.getItem("backend_url");

  if (!token || !backendUrl) {
    throw new Error("No hay autenticación configurada");
  }

  console.log(
    `📤 [ResponseAdapter] Paso 1: Guardando respuesta inicial (${responses.length} items)...`
  );

  const response = await fetch(
    `${backendUrl}/responses/save-response/${formId}?action=${action}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(responses),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ Error en save-response:", errorText);
    throw new Error(`Error HTTP ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  console.log(
    `✅ [ResponseAdapter] Response ID obtenido: ${result.response_id}`
  );

  return {
    response_id: result.response_id,
    relation_bitacora_id: result.id_relation_bitacora,
  };
}

/**
 * Paso 2: Guarda cada respuesta individual
 */
export async function saveIndividualAnswers(
  responses: FormResponse[],
  responseId: number,
  relationBitacoraId?: number,
  action: "send" | "send_and_close" = "send"
): Promise<{ answer_id: number }[]> {
  const token = await AsyncStorage.getItem("authToken");
  const backendUrl = await AsyncStorage.getItem("backend_url");

  if (!token || !backendUrl) {
    throw new Error("No hay autenticación configurada");
  }

  console.log(
    `📤 [ResponseAdapter] Paso 2: Guardando ${responses.length} respuestas individuales...`
  );

  const results = await Promise.all(
    responses.map(async (response) => {
      const answerText =
        typeof response.response === "string"
          ? response.response
          : JSON.stringify(response.response);

      const payload: SaveAnswerPayload = {
        question_id: response.question_id,
        answer_text: answerText,
        file_path: response.file_path,
        response_id: responseId,
        form_design_element_id: response.form_design_element_id,
      };

      if (relationBitacoraId) {
        payload.relation_bitacora_id = relationBitacoraId;
      }

      if (response.repeated_id) {
        payload.repeated_id = response.repeated_id;
      }

      const res = await fetch(
        `${backendUrl}/responses/save-answers/?action=${action}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        console.error(
          `❌ Error guardando respuesta para question_id ${response.question_id}:`,
          errorText
        );
        throw new Error(`Error HTTP ${res.status}`);
      }

      const result = await res.json();
      return result.answer;
    })
  );

  console.log(
    `✅ [ResponseAdapter] ${results.length} respuestas guardadas exitosamente`
  );

  return results;
}

/**
 * Sube un archivo al servidor
 */
export async function uploadFile(
  fileUri: string,
  questionId: number,
  serial?: string
): Promise<string> {
  const token = await AsyncStorage.getItem("authToken");
  const backendUrl = await AsyncStorage.getItem("backend_url");

  if (!token || !backendUrl) {
    throw new Error("No hay autenticación configurada");
  }

  console.log(
    `📤 [ResponseAdapter] Subiendo archivo para question ${questionId}...`
  );

  const fileName = fileUri.split("/").pop() || "file";
  const formData = new FormData();

  formData.append("file", {
    uri: fileUri,
    type: "application/octet-stream",
    name: fileName,
  } as any);

  if (serial) {
    formData.append("serial", serial);
  }

  formData.append("question_id", String(questionId));

  const response = await fetch(`${backendUrl}/responses/upload-file/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ Error subiendo archivo:", errorText);
    throw new Error(`Error HTTP ${response.status}`);
  }

  const result = await response.json();
  console.log(`✅ [ResponseAdapter] Archivo subido: ${result.file_name}`);

  return result.file_name;
}

/**
 * Proceso completo de envío (combina ambos pasos)
 */
export async function submitFormResponses(
  formId: number,
  formValues: Record<string, any>,
  formStructure: any[],
  action: "send" | "send_and_close" = "send"
): Promise<{ success: boolean; response_id: number; message: string }> {
  try {
    console.log(
      "🚀 [ResponseAdapter] Iniciando envío completo de formulario..."
    );

    // 1. Convertir valores a respuestas
    const responses = convertFormValuesToResponses(formValues, formStructure);

    if (responses.length === 0) {
      throw new Error("No hay respuestas para enviar");
    }

    console.log(
      `📋 [ResponseAdapter] ${responses.length} respuestas preparadas`
    );

    // 2. Validar respuestas
    const validation = validateResponses(responses, formStructure);
    if (!validation.isValid) {
      const errorMessages = Object.values(validation.errors).join(", ");
      throw new Error(`Validación fallida: ${errorMessages}`);
    }

    // 3. Guardar respuesta inicial (paso 1)
    const { response_id, relation_bitacora_id } = await saveResponseInitial(
      formId,
      responses,
      action
    );

    // 4. Guardar respuestas individuales (paso 2)
    await saveIndividualAnswers(
      responses,
      response_id,
      relation_bitacora_id,
      action
    );

    const message =
      action === "send_and_close"
        ? "Formulario enviado y cerrado correctamente"
        : "Respuestas guardadas correctamente. Puedes continuar editando.";

    console.log(`✅ [ResponseAdapter] Envío completo exitoso`);

    return {
      success: true,
      response_id,
      message,
    };
  } catch (error) {
    console.error("❌ [ResponseAdapter] Error en envío:", error);
    throw error;
  }
}
