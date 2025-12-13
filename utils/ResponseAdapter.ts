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
  description?: string; // ✅ NUEVO: Para archivos
}

export interface SaveAnswerPayload {
  question_id: number;
  answer_text: string;
  file_path: string;
  response_id: number;
  relation_bitacora_id?: number;
  form_design_element_id: string;
  repeated_id?: string;
  description?: string; // ✅ NUEVO: Para archivos
}

/**
 * Convierte valores del formulario a formato de respuesta
 */
export function convertFormValuesToResponses(
  formValues: Record<string, any>,
  formStructure: any[]
): FormResponse[] {
  console.log(
    "📝 [ResponseAdapter] Valores del formulario recibidos:",
    JSON.stringify(formValues, null, 2)
  );
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
          console.log(
            `🔄 [Repeater] Fila ${rowIndex + 1}/${repeaterValues.length} - repeated_id: ${repeatedId}`
          );

          item.children?.forEach((child: any) => {
            const childValue = rowValues[child.id];
            const childDescriptionValue = rowValues[`${child.id}_description`]; // ✅ Buscar descripción en la fila

            // Log para archivos en repeater
            if (child.type === "file") {
              console.log(`  🔍 [Repeater File] Campo: ${child.id}`);
              console.log(`    - Tiene archivo:`, !!childValue);
              console.log(
                `    - Descripción:`,
                childDescriptionValue || "SIN DESCRIPCIÓN"
              );
            }

            if (
              childValue !== undefined &&
              childValue !== null &&
              childValue !== ""
            ) {
              console.log(
                `  ✅ [Repeater] Campo ${child.id} con valor en fila ${rowIndex + 1}`
              );
              console.log(
                `     📌 question_id: ${child.questionId}, form_design_element_id: ${child.id}, repeated_id: ${repeatedId}`
              );

              const responseData: FormResponse = {
                question_id: child.questionId,
                response:
                  typeof childValue === "object"
                    ? childValue
                    : String(childValue),
                file_path: "",
                form_design_element_id: child.id,
                repeated_id: repeatedId,
              };

              // ✅ Si es un archivo en repeater, agregar descripción
              if (child.type === "file") {
                if (childDescriptionValue) {
                  responseData.description = childDescriptionValue;
                  console.log(
                    `  ✅ [Repeater] Archivo ${child.id} con descripción: "${childDescriptionValue}"`
                  );
                } else {
                  console.log(
                    `  ⚠️ [Repeater] Archivo ${child.id} SIN descripción en fila ${rowIndex + 1}`
                  );
                }
              }

              responses.push(responseData);
            }
          });
        });
      }
      return;
    }

    // Si es un campo con questionId
    if (item.questionId) {
      // ⏭️ SKIP: Campos de solo lectura o visuales (no deben enviarse al backend)
      const skipTypes = [
        "label",
        "help-text",
        "divider",
        "button",
        "image",
        "mathoperations",
      ];
      if (skipTypes.includes(item.type)) {
        console.log(
          `⏭️ [ResponseAdapter] Saltando campo ${item.id} de tipo "${item.type}" (solo lectura/visual)`
        );
        return;
      }

      const value = formValues[item.id];
      const descriptionValue = formValues[`${item.id}_description`]; // ✅ Obtener descripción si existe

      // Log para archivos - DEBUG
      if (item.type === "file") {
        console.log(`🔍 [DEBUG FILE] Campo: ${item.id}, Tipo: ${item.type}`);
        console.log(`  - Valor archivo:`, value);
        console.log(
          `  - Descripción (key: ${item.id}_description):`,
          descriptionValue
        );
        console.log(`  - Todos los valores del form:`, Object.keys(formValues));
      }

      // Validar que el valor exista y no esté vacío
      const isValidValue =
        value !== undefined &&
        value !== null &&
        value !== "" &&
        // Para objetos, verificar que no esté vacío
        (typeof value !== "object" || Object.keys(value).length > 0);

      if (isValidValue) {
        console.log(
          `✅ [ResponseAdapter] Campo ${item.id} tiene valor:`,
          typeof value === "object"
            ? JSON.stringify(value).substring(0, 100)
            : value
        );
        console.log(
          `   📌 question_id: ${item.questionId}, form_design_element_id: ${item.id}${parentRepeatedId ? `, repeated_id: ${parentRepeatedId}` : ""}`
        );

        // ✅ Si es un archivo y tiene descripción, incluirla
        const responseData: FormResponse = {
          question_id: item.questionId,
          response: typeof value === "object" ? value : String(value),
          file_path: "", // Se llenará después si es archivo
          form_design_element_id: item.id,
          repeated_id: parentRepeatedId,
        };

        // Agregar descripción si es un campo de archivo
        if (item.type === "file") {
          if (descriptionValue) {
            responseData.description = descriptionValue;
            console.log(
              `📎 [ResponseAdapter] Archivo ${item.id} con descripción: "${descriptionValue}"`
            );
          } else {
            console.log(
              `⚠️ [ResponseAdapter] Archivo ${item.id} SIN descripción!`
            );
          }
        }

        responses.push(responseData);
      } else {
        console.log(
          `⚠️ [ResponseAdapter] Campo ${item.id} sin valor válido:`,
          value
        );
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

    // ✅ VALIDACIÓN ESPECIAL PARA FILE: Descripción obligatoria (dentro y fuera de repeaters)
    if (item.type === "file" && item.questionId) {
      // Buscar TODAS las respuestas de archivo para este questionId (puede haber múltiples en repeaters)
      const fileResponses = responses.filter(
        (r) => r.question_id === item.questionId
      );

      // Validar cada archivo individualmente
      fileResponses.forEach((fileResponse, index) => {
        if (
          fileResponse.response &&
          (!fileResponse.description || fileResponse.description.trim() === "")
        ) {
          // Si está en un repeater, usar el repeated_id en el error key
          const errorKey = fileResponse.repeated_id
            ? `${item.id}_${fileResponse.repeated_id}_description`
            : `${item.id}_description`;

          errors[errorKey] = "La descripción del archivo es obligatoria";

          console.log(
            `❌ [Validación] Archivo sin descripción - questionId: ${item.questionId}, repeated_id: ${fileResponse.repeated_id || "none"}`
          );
        }
      });
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
      console.log(
        `📝 [ResponseAdapter] Procesando respuesta para question_id ${response.question_id}`
      );

      const answerText =
        typeof response.response === "string"
          ? response.response
          : JSON.stringify(response.response);

      // Log detallado
      console.log(`   - Tipo de response:`, typeof response.response);
      console.log(`   - Longitud answer_text: ${answerText.length} caracteres`);

      // Para question_id 14 (registro facial), mostrar estructura
      if (response.question_id === 14) {
        console.log(`   🔍 [REGISTRO FACIAL] Analizando estructura...`);
        try {
          const parsed = JSON.parse(answerText);
          console.log(`   - Tiene faceData:`, !!parsed.faceData);
          console.log(`   - person_id:`, parsed.faceData?.person_id);
          console.log(`   - personName:`, parsed.faceData?.personName);
          console.log(
            `   - face_images count:`,
            parsed.faceData?.face_images?.length || 0
          );
          console.log(
            `   - successful_images:`,
            parsed.faceData?.successful_images
          );
        } catch (e) {
          console.error(`   ❌ Error parseando JSON:`, e);
        }
      }

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

      // ✅ NUEVO: Incluir descripción si existe (para archivos)
      if (response.description) {
        payload.description = response.description;
        console.log(
          `📎 [ResponseAdapter] Enviando descripción de archivo: "${response.description}"`
        );
      }

      // ✅ Log detallado del payload completo para ver diferenciación de preguntas repetidas
      console.log(
        `   📤 Payload completo:`,
        JSON.stringify(
          {
            question_id: payload.question_id,
            form_design_element_id: payload.form_design_element_id,
            repeated_id: payload.repeated_id || "none",
            answer_preview:
              answerText.substring(0, 50) +
              (answerText.length > 50 ? "..." : ""),
          },
          null,
          2
        )
      );

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
 * Guarda el formulario en cola offline (pending_forms)
 */
export async function saveFormOffline(
  formId: number,
  responses: FormResponse[],
  fileSerials?: Record<number, string>
): Promise<void> {
  console.log(
    `💾 [ResponseAdapter] Guardando formulario ${formId} en cola offline...`
  );

  // Convertir a formato API (para save-response)
  const answersForApi = responses.map((r) => ({
    question_id: r.question_id,
    response: r.file_path ? "" : String(r.response),
    file_path: r.file_path || "",
    form_design_element_id: r.form_design_element_id,
    ...(r.repeated_id && { repeated_id: r.repeated_id }),
  }));

  // Convertir a formato completo (para save-answers)
  const answersFull = responses.map((r) => ({
    question_id: r.question_id,
    answer_text: r.file_path ? "" : String(r.response),
    file_path: r.file_path || "",
    form_design_element_id: r.form_design_element_id,
    question_type: r.file_path ? "file" : "text",
    ...(r.repeated_id && { repeated_id: r.repeated_id }),
  }));

  // Obtener cola actual
  const storedPending = await AsyncStorage.getItem("pending_forms");
  const pendingQueue = storedPending ? JSON.parse(storedPending) : [];

  // Agregar nuevo item
  pendingQueue.push({
    id: formId,
    answersForApi,
    answersFull,
    fileSerials: fileSerials || {},
    timestamp: Date.now(),
  });

  // Guardar cola actualizada
  await AsyncStorage.setItem("pending_forms", JSON.stringify(pendingQueue));

  console.log(
    `✅ [ResponseAdapter] Formulario guardado en cola offline (${responses.length} respuestas)`
  );
}

/**
 * Proceso completo de envío (combina ambos pasos)
 * Si está offline o falla, guarda en cola para envío posterior
 */
export async function submitFormResponses(
  formId: number,
  formValues: Record<string, any>,
  formStructure: any[],
  action: "send" | "send_and_close" = "send",
  isOnline: boolean = true
): Promise<{
  success: boolean;
  response_id?: number;
  message: string;
  savedOffline?: boolean;
}> {
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

    // 3. Si está offline, guardar y retornar inmediatamente
    if (!isOnline) {
      console.log("📡 [ResponseAdapter] Modo OFFLINE - guardando en cola...");
      await saveFormOffline(formId, responses);

      return {
        success: true,
        message:
          "El formulario se guardó para envío automático cuando tengas conexión.",
        savedOffline: true,
      };
    }

    // 4. Intentar envío online
    try {
      // Guardar respuesta inicial (paso 1)
      const { response_id, relation_bitacora_id } = await saveResponseInitial(
        formId,
        responses,
        action
      );

      // Guardar respuestas individuales (paso 2)
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
        savedOffline: false,
      };
    } catch (networkError: any) {
      // 5. Diferenciar entre error de red real vs error del servidor
      const errorMessage = networkError.message || "";
      const isHttpError = errorMessage.includes("Error HTTP"); // "Error HTTP 400", "Error HTTP 500", etc.

      const isNetworkError =
        !isHttpError && // Si es error HTTP (400, 500), NO es error de red
        (errorMessage.includes("Network request failed") ||
          errorMessage.includes("timeout") ||
          errorMessage.includes("Failed to fetch") ||
          errorMessage.includes("Network error") ||
          networkError.code === "NETWORK_ERROR" ||
          networkError.code === "ECONNREFUSED");

      if (isNetworkError) {
        console.error(
          "❌ [ResponseAdapter] Error de RED real (sin conexión), guardando offline:",
          networkError
        );

        await saveFormOffline(formId, responses);

        return {
          success: false,
          message:
            "Sin conexión. El formulario se guardó para envío posterior.",
          savedOffline: true,
        };
      } else {
        // Error del servidor (400, 500, etc.) - NO guardar offline
        console.error(
          "❌ [ResponseAdapter] Error del SERVIDOR, NO guardando offline:",
          networkError
        );

        // Re-lanzar el error para que se muestre al usuario
        throw networkError;
      }
    }
  } catch (error: any) {
    console.error("❌ [ResponseAdapter] Error en envío:", error);
    throw error;
  }
}
