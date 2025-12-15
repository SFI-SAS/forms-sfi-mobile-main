/* eslint-disable prettier/prettier */
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Obtiene la URL del backend configurada
 */
const getBackendUrl = async () => {
  const url = await AsyncStorage.getItem("backend_url");
  return url || "https://api-forms-sfi.service.saferut.com";
};

/**
 * Obtiene el token de autenticación
 */
const getAuthToken = async () => {
  return await AsyncStorage.getItem("authToken");
};

/**
 * 🔥 NUEVO: Obtiene el diseño del formulario (form_design) - Endpoint de PC
 * GET /forms/{formId}/form_design
 */
export const getFormDesign = async (formId) => {
  const backendUrl = await getBackendUrl();
  const token = await getAuthToken();

  try {
    const response = await fetch(`${backendUrl}/forms/${formId}/form_design`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("❌ Error obteniendo form_design:", error);
    throw error;
  }
};

/**
 * 🔥 NUEVO: Obtiene las preguntas del formulario - Endpoint de PC
 * GET /forms/{formId}/questions
 */
export const getFormQuestions = async (formId) => {
  const backendUrl = await getBackendUrl();
  const token = await getAuthToken();

  try {
    const response = await fetch(`${backendUrl}/forms/${formId}/questions`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("❌ Error obteniendo questions:", error);
    throw error;
  }
};

/**
 * 🔥 NUEVO: Guarda la respuesta inicial (Paso 1) - Endpoint de PC
 * POST /responses/save-response/{formId}?action={send | send_and_close}
 */
export const saveResponse = async (formId, responses, action = "send") => {
  const backendUrl = await getBackendUrl();
  const token = await getAuthToken();

  try {
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
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("❌ Error guardando response:", error);
    throw error;
  }
};

/**
 * 🔥 NUEVO: Guarda respuestas individuales (Paso 2) - Endpoint de PC
 * POST /responses/save-answers/?action={send | send_and_close}
 */
export const saveAnswers = async (answerData, action = "send") => {
  const backendUrl = await getBackendUrl();
  const token = await getAuthToken();

  try {
    const response = await fetch(
      `${backendUrl}/responses/save-answers/?action=${action}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(answerData),
      }
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("❌ Error guardando answer:", error);
    throw error;
  }
};

/**
 * 🔥 NUEVO: Sube archivo adjunto - Endpoint de PC
 * POST /responses/upload-file/
 */
export const uploadFile = async (file, questionId, serial = null) => {
  const backendUrl = await getBackendUrl();
  const token = await getAuthToken();

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("question_id", questionId.toString());
    if (serial) {
      formData.append("serial", serial);
    }

    const response = await fetch(`${backendUrl}/responses/upload-file/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("❌ Error subiendo archivo:", error);
    throw error;
  }
};

/**
 * 🔥 NUEVO: Obtiene correlaciones de tabla - Endpoint de PC
 * GET /questions/question-table-relation/answers/{questionId}
 */
export const getTableCorrelations = async (questionId) => {
  const backendUrl = await getBackendUrl();
  const token = await getAuthToken();

  try {
    const response = await fetch(
      `${backendUrl}/questions/question-table-relation/answers/${questionId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("❌ Error obteniendo correlaciones:", error);
    throw error;
  }
};

/**
 * 🔥 NUEVO: Obtiene formularios completados con respuestas - Endpoint de PC
 * GET /forms/users/completed_forms_with_responses
 */
export const getCompletedFormsWithResponses = async () => {
  const backendUrl = await getBackendUrl();
  const token = await getAuthToken();

  try {
    const response = await fetch(
      `${backendUrl}/forms/users/completed_forms_with_responses`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("❌ Error obteniendo formularios completados:", error);
    throw error;
  }
};

/**
 * 🔥 NUEVO: Obtiene resumen de formularios asignados - Endpoint de PC
 * GET /forms/users/form_by_user/summary
 */
export const getAssignedFormsSummary = async () => {
  const backendUrl = await getBackendUrl();
  const token = await getAuthToken();

  try {
    const response = await fetch(
      `${backendUrl}/forms/users/form_by_user/summary`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("❌ Error obteniendo formularios asignados:", error);
    throw error;
  }
};

/**
 * 🔥 NUEVO: Obtiene formularios con respuestas asignados para aprobar - Endpoint de PC
 * GET /forms/user/assigned-forms-with-responses
 */
export const getFormsToApprove = async () => {
  const backendUrl = await getBackendUrl();
  const token = await getAuthToken();

  try {
    const response = await fetch(
      `${backendUrl}/forms/user/assigned-forms-with-responses`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("❌ Error obteniendo formularios para aprobar:", error);
    throw error;
  }
};

/**
 * 🔥 NUEVO: Obtiene formularios asignados por usuario con paginación - Endpoint de PC
 * GET /forms/users/form_by_user?page={page}&page_size={pageSize}
 * ✅ Retorna { items: [], total: number } según especificación PC
 */
export const getFormsByUser = async (page = 1, pageSize = 20) => {
  const backendUrl = await getBackendUrl();
  const token = await getAuthToken();

  try {
    console.log(
      `🌐 [API] Consultando formularios - Página ${page}, Tamaño ${pageSize}`
    );

    const response = await fetch(
      `${backendUrl}/forms/users/form_by_user?page=${page}&page_size=${pageSize}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // ✅ El endpoint retorna { items: [...], total: number }
    if (data && data.items && Array.isArray(data.items)) {
      console.log(
        `✅ [API] ${data.items.length} formularios obtenidos de ${data.total} totales`
      );
      return {
        items: data.items,
        total: data.total,
        page: page,
        pageSize: pageSize,
        totalPages: Math.ceil(data.total / pageSize),
      };
    }

    // Fallback para compatibilidad con respuesta antigua (array directo)
    if (Array.isArray(data)) {
      console.log(
        `✅ [API] ${data.length} formularios obtenidos (formato legacy)`
      );
      return {
        items: data,
        total: data.length,
        page: page,
        pageSize: pageSize,
        totalPages: 1,
      };
    }

    return {
      items: [],
      total: 0,
      page: page,
      pageSize: pageSize,
      totalPages: 0,
    };
  } catch (error) {
    console.error("❌ Error obteniendo formularios por usuario:", error);
    throw error;
  }
};

/**
 * 🔥 NUEVO: Valida token y obtiene información del usuario - Endpoint de PC
 * GET /auth/validate-token
 */
export const validateToken = async () => {
  const backendUrl = await getBackendUrl();
  const token = await getAuthToken();

  try {
    const response = await fetch(`${backendUrl}/auth/validate-token`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("❌ Error validando token:", error);
    throw error;
  }
};

/**
 * 🔥 NUEVO: Obtiene respuestas de formularios del usuario con paginación
 * GET /responses/get_responses/all?page={page}&page_size={pageSize}
 */
export const getUserResponsesPaginated = async (page = 1, pageSize = 10) => {
  const backendUrl = await getBackendUrl();
  const token = await getAuthToken();

  try {
    const response = await fetch(
      `${backendUrl}/responses/get_responses/all?page=${page}&page_size=${pageSize}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("❌ Error obteniendo respuestas del usuario:", error);
    throw error;
  }
};

// ========================================
// FUNCIONES LEGACY (para compatibilidad)
// ========================================

export const sendResponsesToAPI = async (formId, responses) => {
  const formData = new FormData();

  responses.forEach((response, index) => {
    formData.append(
      "token",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjZ29tZXpAc2Zpc2FzLmNvbSIsImV4cCI6MTc0MjQ3MjM2OH0.1NY0oc1vYVcqwziMMa8vmoF41XgpqIr-Rh0Cf6PMI-c"
    );
    formData.append("id_form", formId);
    formData.append("reference", "000321");
    if (response.type === "text") {
      formData.append(`text_${index}`, response.content);
    } else if (response.type === "image") {
      const fileName = response.content.split("/").pop();
      const match = /\.(\w+)$/.exec(fileName);
      const type = match ? `image/${match[1]}` : `image`;

      formData.append(`data_file`, {
        uri: response.content,
        name: fileName,
        type,
      });
    }
  });

  try {
    const response = await fetch(
      `https://api-forms-sfi.service.saferut.com/response_user/submit_data`,
      {
        method: "POST",
        headers: {
          "Content-Type": "multipart/form-data",
        },
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error("Failed to sync responses with the API");
    }

    await Promise.all(
      responses.map(async (response) => {
        if (response.type === "image") {
          await FileSystem.deleteAsync(response.content, { idempotent: true });
        }
      })
    );
  } catch (error) {
    console.error("API error:", error);
    throw error;
  }
};

// export const getFormsToAPI = async (accessToken) => {
//   accessToken =
//     "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjZ29tZXpAc2Zpc2FzLmNvbSIsImV4cCI6MTc0MjQ3MjM2OH0.1NY0oc1vYVcqwziMMa8vmoF41XgpqIr-Rh0Cf6PMI-c";
//   try {
//     const response = await fetch(
//       `https://api-forms-sfi.service.saferut.com/forms/?skip=0&limit=10`,
//       {
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//         },
//       }
//     );
//     const json = await response.json();
//     if (!response.ok) {
//       throw new Error("Failed to sync responses with the API");
//     }
//     return json;
//   } catch (error) {
//     console.error("API error:", error);
//     throw error;
//   }
// };

export const getFormToAPI = async (form_id, accessToken) => {
  accessToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjZ29tZXpAc2Zpc2FzLmNvbSIsImV4cCI6MTc0MjQ3MjM2OH0.1NY0oc1vYVcqwziMMa8vmoF41XgpqIr-Rh0Cf6PMI-c";
  try {
    const response = await fetch(
      `https://api-forms-sfi.service.saferut.com/forms/${form_id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    const json = await response.json();
    if (!response.ok) {
      throw new Error("Failed to sync responses with the API");
    }

    return json;
  } catch (error) {
    console.error("API error:", error);
    throw error;
  }
};

/**
 * 🆕 Obtiene los instructivos (archivos de ayuda) de un formulario
 * GET /forms/{formId}/instructivos
 */
export const getFormInstructivos = async (formId) => {
  const backendUrl = await getBackendUrl();
  const token = await getAuthToken();

  try {
    const response = await fetch(`${backendUrl}/forms/${formId}/instructivos`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("❌ Error obteniendo instructivos:", error);
    throw error;
  }
};

/**
 * 🆕 Obtiene el mensaje de alerta de un formulario
 * GET /forms/{formId}/alert-message
 */
export const getFormAlertMessage = async (formId) => {
  const backendUrl = await getBackendUrl();
  const token = await getAuthToken();

  try {
    const response = await fetch(
      `${backendUrl}/forms/${formId}/alert-message`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("❌ Error obteniendo mensaje de alerta:", error);
    throw error;
  }
};

/**
 * 🆕 Obtiene operaciones matemáticas por IDs de preguntas
 * GET /forms/{form_id}/math-operations/by-questions?question_ids=1,2,3
 */
export const getMathOperationsByQuestions = async (formId, questionIds) => {
  const backendUrl = await getBackendUrl();
  const token = await getAuthToken();

  try {
    // Convertir array a string separado por comas
    const idsString = Array.isArray(questionIds)
      ? questionIds.join(",")
      : questionIds;

    const url = `${backendUrl}/responses/${formId}/math-operations/by-questions?question_ids=${idsString}`;

    console.log(
      `📐 [API] Obteniendo operaciones matemáticas para preguntas: ${idsString}`
    );
    console.log(`🔗 [API] URL completa: ${url}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    console.log(
      `📊 [API] Response status: ${response.status} ${response.statusText}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [API] Error response body:`, errorText);
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ [API] Operaciones matemáticas obtenidas:`, data);
    return data;
  } catch (error) {
    console.error("❌ Error obteniendo operaciones matemáticas:", error);
    throw error;
  }
};

/**
 * 🆕 Descarga un archivo de instructivo
 * GET /forms/files/download-instructivo?file_path=...
 *
 * IMPORTANTE: Envía la ruta exactamente como viene de la BD
 * El backend se encarga de normalizar y resolver la ruta
 */
export const downloadInstructivo = async (filePath) => {
  const backendUrl = await getBackendUrl();
  const token = await getAuthToken();

  try {
    console.log("📥 [API] Descargando instructivo:", filePath);

    // Enviar la ruta SIN modificar - el backend la normalizará
    const url = `${backendUrl}/forms/files/download-instructivo?file_path=${encodeURIComponent(filePath)}`;

    console.log("🔗 [API] URL de descarga:", url);
    console.log("🔑 [API] Token presente:", token ? "Sí" : "No");

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log(
      "📡 [API] Respuesta del servidor:",
      response.status,
      response.statusText
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ [API] Error del servidor:", errorText);
      throw new Error(
        `HTTP ${response.status}: ${response.statusText} - ${errorText}`
      );
    }

    console.log("✅ [API] Archivo listo para descargar");
    return response;
  } catch (error) {
    console.error("❌ [API] Error descargando instructivo:", error);
    throw error;
  }
};
