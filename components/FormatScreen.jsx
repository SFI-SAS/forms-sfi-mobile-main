import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  BackHandler,
  Dimensions, // Import Dimensions
  Animated, // Import Animated
  Easing, // Import Easing
  Modal,
  Image,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Picker } from "@react-native-picker/picker";
import NetInfo from "@react-native-community/netinfo";
import DateTimePicker from "@react-native-community/datetimepicker"; // Import DateTimePicker
import { useFocusEffect } from "@react-navigation/native";
import { SvgXml } from "react-native-svg";
import { HomeIcon } from "./Icons"; // Adjust the import path as necessary
import { Ionicons } from "@expo/vector-icons"; // Para iconos si se desea
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";

const { width, height } = Dimensions.get("window"); // Get screen dimensions

const QUESTIONS_KEY = "offline_questions";
const FORMS_METADATA_KEY = "offline_forms_metadata";
const RELATED_ANSWERS_KEY = "offline_related_answers";
const PENDING_SAVE_RESPONSE_KEY = "pending_save_response";
const PENDING_SAVE_ANSWERS_KEY = "pending_save_answers";
const PRIMARY_BLUE = "#007AFF"; // El azul corporativo de iOS/Apple
const DARK_GRAY = "#171717"; // Casi negro para máximo contraste
const MEDIUM_GRAY = "#636366"; // Gris oscuro para el subtítulo

// Copia el SVG como string
const spinnerSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill="#000000FF" stroke="#EE4138FF" stroke-width="15" transform-origin="center" d="m148 84.7 13.8-8-10-17.3-13.8 8a50 50 0 0 0-27.4-15.9v-16h-20v16A50 50 0 0 0 63 67.4l-13.8-8-10 17.3 13.8 8a50 50 0 0 0 0 31.7l-13.8 8 10 17.3 13.8-8a50 50 0 0 0 27.5 15.9v16h20v-16a50 50 0 0 0 27.4-15.9l13.8 8 10-17.3-13.8-8a50 50 0 0 0 0-31.7Zm-47.5 50.8a35 35 0 1 1 0-70 35 35 0 0 1 0 70Z"><animateTransform type="rotate" attributeName="transform" calcMode="spline" dur="1.8" values="0;120" keyTimes="0;1" keySplines="0 0 1 1" repeatCount="indefinite"></animateTransform></path></svg>
`;

const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutos

const saveCompletedFormAnswers = async ({
  formId,
  answers,
  questions,
  mode,
}) => {
  try {
    const key = `completed_form_answers_${formId}`;
    const now = new Date();
    // Reemplaza moment por funciones nativas JS
    const pad = (n) => (n < 10 ? "0" + n : n);
    const submission_date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const submission_time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    // Mapear question_id a question_text para mostrar en MyForms
    const questionTextMap = {};
    questions.forEach((q) => {
      questionTextMap[q.id] = q.question_text;
    });
    // Guardar como array de diligenciamientos
    const stored = await AsyncStorage.getItem(key);
    const arr = stored ? JSON.parse(stored) : [];
    arr.push({
      form_id: formId, // <-- Agrega el form_id explícitamente aquí
      answers: answers.map((a) => ({
        ...a,
        question_text: questionTextMap[a.question_id] || "",
      })),
      submission_date,
      submission_time,
      mode,
    });
    await AsyncStorage.setItem(key, JSON.stringify(arr));
  } catch (e) {
    // No bloquear flujo si falla
    console.error("❌ Error guardando respuestas completadas offline:", e);
  }
};

const BACKEND_URL_KEY = "backend_url";
const getBackendUrl = async () => {
  const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
  return stored || "";
};

export default function FormatScreen(props) {
  const router = useRouter();
  const { id, title, logo_url: logoUrlParam } = useLocalSearchParams(); // Recibir el ID del formulario como parámetro
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [tableAnswers, setTableAnswers] = useState({}); // State to store related answers for table questions
  const [userFieldSelection, setUserFieldSelection] = useState({}); // State to store selected field for "users" source
  const [textAnswers, setTextAnswers] = useState({});
  const [tableAnswersState, setTableAnswersState] = useState({});
  const [selectedAnswers, setSelectedAnswers] = useState({}); // Initialize selectedAnswers as an empty object
  const [datePickerVisible, setDatePickerVisible] = useState({}); // State to manage visibility of DateTimePicker
  const [errors, setErrors] = useState({});
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [spinAnim] = useState(new Animated.Value(0));
  const [nonRepeatedLocked, setNonRepeatedLocked] = useState(false);
  const [firstNonRepeatedAnswers, setFirstNonRepeatedAnswers] = useState({});
  const [isRepeatedQuestions, setIsRepeatedQuestions] = useState([]);
  const [singleRepeated, setSingleRepeated] = useState(false);
  const [submittedRepeatedGroups, setSubmittedRepeatedGroups] = useState([]); // Nuevo: almacena grupos enviados
  const [pickerSearch, setPickerSearch] = useState({}); // Nuevo: estado para búsqueda en Pickers
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const inactivityTimer = useRef(null);
  const [fileSerials, setFileSerials] = useState({}); // { [questionId]: serial }
  const [fileUris, setFileUris] = useState({}); // { [questionId]: fileUri }
  const [fileModal, setFileModal] = useState({
    visible: false,
    questionId: null,
  });

  
  const [showSerialModal, setShowSerialModal] = useState({
    visible: false,
    serial: "",
  });
  const [generatingSerial, setGeneratingSerial] = useState(false);
  const [formMeta, setFormMeta] = useState({}); // metadata del formulario (incluye logo)
  const [locationRelatedAnswers, setLocationRelatedAnswers] = useState({}); // { [questionId]: [{label, value}] }
  const [locationSelected, setLocationSelected] = useState({}); // { [questionId]: value }

  // NUEVO: Estado para correlaciones de preguntas tipo tabla
  const [tableCorrelations, setTableCorrelations] = useState({});
  const [tableRelatedQuestions, setTableRelatedQuestions] = useState({});
  const [tableAutoFilled, setTableAutoFilled] = useState({}); // Para controlar si ya se autocompletó


  useFocusEffect(
    React.useCallback(() => {
      const disableBack = () => true;
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        disableBack
      );
      return () => {
        subscription.remove();
      };
    }, [])
  );

  // NUEVO: Cargar preguntas y respuestas relacionadas SOLO de AsyncStorage
  const loadAllOfflineData = async (formId) => {
    try {
      console.log("📥 Iniciando carga de formulario...");

      // Verificar si hay conexión a internet
      const isOnline = await NetInfo.fetch().then(state => state.isConnected);
      console.log("🌐 Estado conexión:", isOnline ? "ONLINE" : "OFFLINE");

      // Cargar preguntas guardadas localmente
      const storedQuestions = await AsyncStorage.getItem(QUESTIONS_KEY);
      const offlineQuestions = storedQuestions ? JSON.parse(storedQuestions) : {};

      // SI TIENES INTERNET - Descargar versión fresca del backend
      if (isOnline) {
        console.log("📡 Descargando formulario desde servidor...");
        try {
          const backendUrl = await getBackendUrl();
          const token = await AsyncStorage.getItem("authToken");

          // Usar el endpoint exacto que vimos
          const res = await fetch(`${backendUrl}/forms/${formId}/`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });
          const formData = await res.json();
          console.log("✅ Respuesta del servidor:", formData);

          // El servidor devuelve { "questions": [...], "form_design": [...] }
          if (formData && formData.questions) {
            offlineQuestions[formId] = formData.questions;
            await AsyncStorage.setItem(QUESTIONS_KEY, JSON.stringify(offlineQuestions));
            console.log("💾 Formulario guardado en local storage");

            // Extraer logo del form_design
            // Extraer logo del form_design
            if (formData.form_design && Array.isArray(formData.form_design)) {
              const designConfig = formData.form_design.find(item => item && item.logo);
              if (designConfig && designConfig.logo && designConfig.logo.enabled && designConfig.logo.url) {
                console.log("🖼️ Logo encontrado en form_design:", designConfig.logo.url);

                // Guardar metadata con logo
                const storedMeta = await AsyncStorage.getItem(FORMS_METADATA_KEY);
                const metaObj = storedMeta ? JSON.parse(storedMeta) : {};
                metaObj[formId] = {
                  ...metaObj[formId],
                  logo_url: designConfig.logo.url,
                  title: formData.title || ""
                };
                await AsyncStorage.setItem(FORMS_METADATA_KEY, JSON.stringify(metaObj));

                // Actualizar estado inmediatamente
                setFormMeta((prev) => ({
                  ...prev,
                  logo_url: designConfig.logo.url
                }));
              }
            }
          }
        } catch (e) {
          console.warn("⚠️ No se pudo descargar, usando versión local:", e.message);
          // Continúa con la versión local si hay error
        }
      }

      // Verificar si hay preguntas (descargadas o locales)
      if (!offlineQuestions[formId]) {
        Alert.alert(
          "Modo Offline",
          "No hay preguntas guardadas para este formulario."
        );
        setLoading(false);
        return;
      }

      // Cargar las preguntas en el estado
      setQuestions(offlineQuestions[formId]);
      console.log("✅ Preguntas cargadas:", offlineQuestions[formId].length);

      // ========== RESTO DEL CÓDIGO (IGUAL QUE ANTES) ==========
      const storedRelated = await AsyncStorage.getItem(RELATED_ANSWERS_KEY);
      const offlineRelated = storedRelated ? JSON.parse(storedRelated) : {};
      const tableAnswersObj = {};
      const locationRelatedObj = {};
      const correlationsObj = {};
      const relatedQuestionsObj = {};

      offlineQuestions[formId].forEach((q) => {
        if (q.question_type === "table") {
          const rel = offlineRelated[q.id];
          if (rel && Array.isArray(rel.data)) {
            tableAnswersObj[q.id] = rel.data
              .map((item) => {
                if (typeof item === "object" && item.name) return item.name;
                if (typeof item === "string") return item;
                return null;
              })
              .filter((item) => typeof item === "string" && item.length > 0);
          } else if (rel && Array.isArray(rel)) {
            tableAnswersObj[q.id] = rel.filter(
              (item) => typeof item === "string" && item.length > 0
            );
          } else {
            tableAnswersObj[q.id] = [];
          }

          if (rel && rel.correlations) {
            correlationsObj[q.id] = rel.correlations;
          }
          if (rel && rel.related_question) {
            relatedQuestionsObj[q.id] = rel.related_question;
          }
        }

        if (
          q.question_type === "location" &&
          Array.isArray(q.related_answers) &&
          q.related_answers.length > 0
        ) {
          locationRelatedObj[q.id] = q.related_answers.map((rel) => {
            const coordAns = rel.answers.find(
              (a) =>
                a.answer_text &&
                a.answer_text.match(/^-?\d+\.\d+,\s*-?\d+\.\d+/)
            );
            const labelAns = rel.answers.find(
              (a) => !a.answer_text.match(/^-?\d+\.\d+,\s*-?\d+\.\d+/)
            );
            return {
              label: labelAns
                ? labelAns.answer_text
                : coordAns
                  ? coordAns.answer_text
                  : "Ubicación",
              value: coordAns ? coordAns.answer_text : "",
              response_id: rel.response_id,
            };
          });
        }
      });

      setTableAnswers(tableAnswersObj);
      setLocationRelatedAnswers(locationRelatedObj);
      setTableCorrelations(correlationsObj);
      setTableRelatedQuestions(relatedQuestionsObj);

    } catch (error) {
      console.error("❌ Error cargando datos:", error);
      Alert.alert("Error", "No se pudieron cargar los datos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadAllOfflineData(id);
    }
  }, [id]);

  // Cargar metadata del formulario (incluyendo logo) desde AsyncStorage solo si no viene por props
  useEffect(() => {
    const loadFormMeta = async () => {
      if (logoUrlParam) {
        setFormMeta((prev) => ({ ...prev, logo_url: logoUrlParam }));
        return;
      }
      try {
        const storedMeta = await AsyncStorage.getItem(FORMS_METADATA_KEY);
        if (storedMeta) {
          const metaObj = JSON.parse(storedMeta);
          if (metaObj && metaObj[id]) {
            setFormMeta(metaObj[id]);
          }
        }
      } catch (e) {
        // Si falla, ignora
      }
    };
    if (id) loadFormMeta();
  }, [id, logoUrlParam]);

  const handleAnswerChange = (questionId, value) => {
    console.log(
      `✏️ Capturando respuesta para pregunta ID ${questionId}:`,
      value
    );
    setAnswers((prev) => ({ ...prev, [questionId]: value }));

    // Save answers to AsyncStorage
    AsyncStorage.getItem("offline_answers")
      .then((storedAnswers) => {
        const offlineAnswers = storedAnswers ? JSON.parse(storedAnswers) : {};
        offlineAnswers[questionId] = value;
        console.log(
          `💾 Guardando respuesta en AsyncStorage para pregunta ID ${questionId}:`,
          value
        );
        return AsyncStorage.setItem(
          "offline_answers",
          JSON.stringify(offlineAnswers)
        );
      })
      .catch((error) =>
        console.error("❌ Error guardando respuestas en AsyncStorage:", error)
      );
  };

  // Usa la función handleFileUploadWithSerial ya existente, no la declares de nuevo.
  // Solo agrega la función handleFileButtonPress para orquestar el flujo de serial + archivo:
  const handleFileButtonPress = async (questionId) => {
    await generateSerial(questionId);
    await handleFileUploadWithSerial(questionId);
  };

  const handleFileUpload = async (questionId) => {
    console.log("📂 Subiendo archivo para pregunta ID:", questionId);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*", // Allow all file types
        copyToCacheDirectory: true,
      });

      console.log("📄 Resultado del selector de documentos:", result);

      if (result && !result.canceled && result.assets?.[0]?.uri) {
        handleAnswerChange(questionId, result.assets[0].uri); // Save the file URI in the answers state
        Alert.alert("Archivo seleccionado", `Ruta: ${result.assets[0].uri}`);
      } else if (result && result.canceled) {
        console.log("⚠️ Selección de archivo cancelada por el usuario.");
      } else {
        console.error(
          "❌ Resultado inesperado del selector de documentos:",
          result
        );
      }
    } catch (error) {
      console.error("❌ Error seleccionando archivo:", error);
      Alert.alert("Error", "No se pudo seleccionar el archivo.");
    }
  };

  const handleAddField = (questionId) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: Array.isArray(prev[questionId])
        ? [...prev[questionId], { id: Date.now(), value: "" }] // Add unique ID for each input
        : [{ id: Date.now(), value: "" }], // Ensure it's an array
    }));
  };

  const handleRemoveField = (questionId, fieldId) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: Array.isArray(prev[questionId])
        ? prev[questionId].filter((field) => field.id !== fieldId)
        : [],
    }));
  };

  const handleFieldChange = (questionId, fieldId, value) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: prev[questionId].map((field) =>
        field.id === fieldId ? { ...field, value } : field
      ),
    }));
  };

  const handleTextChange = (questionId, index, value) => {
    console.log(
      `✏️ Actualizando respuesta ${index + 1} para pregunta ID ${questionId}:`,
      value
    );
    setTextAnswers((prev) => {
      const updatedAnswers = [...(prev[questionId] || [])];
      updatedAnswers[index] = value;
      return { ...prev, [questionId]: updatedAnswers };
    });
  };

  const handleAddTextField = (questionId) => {
    console.log(`➕ Agregando nuevo campo para pregunta ID ${questionId}`);
    setTextAnswers((prev) => ({
      ...prev,
      [questionId]: [...(prev[questionId] || []), ""],
    }));
  };

  const handleRemoveTextField = (questionId, index) => {
    setTextAnswers((prev) => ({
      ...prev,
      [questionId]: prev[questionId].filter((_, i) => i !== index),
    }));
  };

  const handleTableSelectChange = (questionId, index, value) => {
    console.log(
      `✏️ Actualizando respuesta ${index + 1} para pregunta tabla ID ${questionId}:`,
      value
    );
    setTableAnswersState((prev) => {
      const updatedAnswers = [...(prev[questionId] || [])];
      updatedAnswers[index] = value;
      return { ...prev, [questionId]: updatedAnswers };
    });
  };

  // Agregar estas funciones después de handleRemoveTextField
  const handleAddTableAnswer = (questionId) => {
    console.log(`➕ Agregando nuevo campo tabla para pregunta ID ${questionId}`);
    setTableAnswersState((prev) => ({
      ...prev,
      [questionId]: [...(prev[questionId] || []), ""],
    }));
  };

  const handleRemoveTableAnswer = (questionId, index) => {
    console.log(`➖ Removiendo campo tabla ${index} para pregunta ID ${questionId}`);
    setTableAnswersState((prev) => ({
      ...prev,
      [questionId]: prev[questionId].filter((_, i) => i !== index),
    }));
  };

  // NUEVO: Función para autocompletar campos relacionados de tipo tabla (bidireccional, por valor)
  const handleTableSelectChangeWithCorrelation = (questionId, index, value) => {

    setTableAnswersState((prev) => {
      const updatedAnswers = [...(prev[questionId] || [])];
      updatedAnswers[index] = value;

      return { ...prev, [questionId]: updatedAnswers };
    });

    // --- Correlaciones directas ---
    const correlation = tableCorrelations[questionId]?.[value];
    console.log("[DEBUG] Correlación directa encontrada:", correlation);

    if (correlation) {
      Object.entries(correlation).forEach(([relatedQId, relatedValue]) => {
        // Buscar el valor en las opciones de todos los selects tipo tabla
        Object.entries(tableAnswers).forEach(([otherQId, options]) => {
          if (otherQId !== questionId && Array.isArray(options)) {
            // Si el valor relacionado existe en las opciones de este select
            if (options.includes(relatedValue)) {
              setTableAnswersState((prev) => {
                const arr = [...(prev[otherQId] || [])];
                if (!arr[0]) {
                  arr[0] = relatedValue;
                  setTableAutoFilled((autoPrev) => ({
                    ...autoPrev,
                    [otherQId]: { ...(autoPrev[otherQId] || {}), [0]: true },
                  }));
                  console.log(
                    `[DEBUG] Autocompletado por valor en ${otherQId} con valor ${relatedValue}`
                  );
                } else {
                  console.log(
                    `[DEBUG] No se autocompleta ${otherQId} porque ya tiene valor:`,
                    arr[0]
                  );
                }
                console.log("[DEBUG] Estado tras autocompletar por valor:", {
                  ...prev,
                  [otherQId]: arr,
                });
                return { ...prev, [otherQId]: arr };
              });
            }
          }
        });
      });
      setTableAutoFilled((prev) => ({
        ...prev,
        [questionId]: { ...(prev[questionId] || {}), [index]: true },
      }));
      console.log(
        `[DEBUG] Marcado como autocompletado el select ${questionId} index ${index}`
      );
    }

    // --- Correlaciones inversas ---
    Object.entries(tableCorrelations).forEach(([otherQId, corrObj]) => {
      if (otherQId !== questionId) {
        Object.entries(corrObj).forEach(([corrValue, rels]) => {
          if (rels && rels[questionId] && rels[questionId] === value) {
            // Buscar el valor en las opciones de todos los selects tipo tabla
            Object.entries(tableAnswers).forEach(([targetQId, options]) => {
              if (targetQId !== questionId && Array.isArray(options)) {
                if (options.includes(corrValue)) {
                  setTableAnswersState((prev) => {
                    const arr = [...(prev[targetQId] || [])];
                    if (!arr[0]) {
                      arr[0] = corrValue;
                      setTableAutoFilled((autoPrev) => ({
                        ...autoPrev,
                        [targetQId]: {
                          ...(autoPrev[targetQId] || {}),
                          [0]: true,
                        },
                      }));
                      console.log(
                        `[DEBUG] Autocompletado inverso por valor en ${targetQId} con valor ${corrValue}`
                      );
                    } else {
                      console.log(
                        `[DEBUG] No se autocompleta inverso ${targetQId} porque ya tiene valor:`,
                        arr[0]
                      );
                    }
                    console.log(
                      "[DEBUG] Estado tras autocompletar inverso por valor:",
                      { ...prev, [targetQId]: arr }
                    );
                    return { ...prev, [targetQId]: arr };
                  });
                }
              }
            });
          }
        });
      }
    });

    // --- Estado final de todos los selects tipo tabla ---
    setTimeout(() => {
      setTableAnswersState((prev) => {
        console.log(
          "[DEBUG] Estado FINAL de tableAnswersState:",
          JSON.stringify(prev)
        );
        return prev;
      });
    }, 600);
  };

  const handleDateChange = (questionId, selectedDate) => {
    if (selectedDate) {
      const formattedDate = selectedDate.toISOString().split("T")[0]; // Format: YYYY-MM-DD
      setAnswers((prev) => ({ ...prev, [questionId]: formattedDate }));
    }
    setDatePickerVisible((prev) => ({ ...prev, [questionId]: false })); // Hide the DateTimePicker
  };

  useEffect(() => {
    // Fetch related answers for table questions
    questions
      .filter((question) => question.question_type === "table")
      .forEach((question) => {
        NetInfo.fetch().then((state) => {
          if (state.isConnected) {
            fetchRelatedAnswers(question.id);
          } else {
            loadOfflineAnswers(question.id);
          }
        });
      });
  }, [questions]);

  useEffect(() => {
    const initialTextAnswers = {};
    const initialTableAnswers = {};

    questions.forEach((q) => {
      if (q.question_type === "text") {
        initialTextAnswers[q.id] = [""];
      } else if (q.question_type === "table") {
        initialTableAnswers[q.id] = [""];
      }
    });

    setTextAnswers(initialTextAnswers);
    setTableAnswersState(initialTableAnswers);
  }, [questions]);

  useEffect(() => {
    if (submitting) {
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinAnim.stopAnimation();
      spinAnim.setValue(0);
    }
  }, [submitting]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const sendAnswers = async (answers, responseId, requestOptions) => {
    const results = [];
    for (let i = 0; i < answers.length; i++) {
      const answer = answers[i];
      try {
        const isFile = answer.question_type === "file";
        const responseData = {
          response_id: responseId,
          question_id: answer.question_id,
          answer_text: isFile ? "" : answer.answer_text,
          file_path: answer.file_path || "",
        };

        console.log(
          `📤 Enviando respuesta ${i + 1}/${answers.length}`,
          responseData
        );

        await new Promise((resolve) => setTimeout(resolve, 50));

        const backendUrl = await getBackendUrl();
        const res = await fetch(`${backendUrl}/responses/save-answers/`, {
          method: "POST",
          headers: requestOptions.headers,
          body: JSON.stringify(responseData),
        });

        const responseJson = await res.json();
        console.log("🟢 Respuesta de save-answers:", responseJson);

        // Si es archivo y tiene serial, asocia el serial al answer_id devuelto (nuevo formato de respuesta)
        if (
          isFile &&
          fileSerials[answer.question_id] &&
          responseJson &&
          responseJson.answer &&
          responseJson.answer.answer_id
        ) {
          try {
            const serialPayload = {
              answer_id: responseJson.answer.answer_id,
              serial: fileSerials[answer.question_id],
            };
            const serialRes = await fetch(
              `${backendUrl}/responses/file-serials/`,
              {
                method: "POST",
                headers: requestOptions.headers,
                body: JSON.stringify(serialPayload),
              }
            );
            const serialJson = await serialRes.json();
            console.log("🟢 Respuesta de file-serials:", serialJson);
          } catch (serialErr) {
            console.error("❌ Error asociando serial al answer:", serialErr);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
        results.push(responseJson);
      } catch (error) {
        console.error(`❌ Error en respuesta ${i + 1}:`, error);
        results.push({ error: true, message: error.message });
      }
    }
    return results;
  };

  const handleSubmitForm = async () => {
    console.log("📤 Iniciando envío de formulario ID:", id);
    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");
      const backendUrl = await getBackendUrl();
      // Preparar todas las respuestas
      const allAnswers = [];
      console.log("📋 Preparando respuestas para cada pregunta...");

      for (const question of questions) {
        const questionId = question.id;

        // Text (varios campos)
        if (
          question.question_type === "text" &&
          textAnswers[questionId]?.length > 0
        ) {
          const validAnswers = textAnswers[questionId].filter(
            (answer) => answer.trim() !== ""
          );
          validAnswers.forEach((answer) => {
            allAnswers.push({
              question_id: questionId,
              answer_text: answer,
              file_path: "",
            });
          });
        }
        // Table (varios campos)
        else if (
          question.question_type === "table" &&
          tableAnswersState[questionId]?.length > 0
        ) {
          const validAnswers = tableAnswersState[questionId].filter(
            (answer) => answer.trim() !== ""
          );
          validAnswers.forEach((answer) => {
            allAnswers.push({
              question_id: questionId,
              answer_text: answer,
              file_path: "",
            });
          });
        }
        // Multiple choice
        else if (
          question.question_type === "multiple_choice" &&
          Array.isArray(answers[questionId]) &&
          answers[questionId].length > 0
        ) {
          answers[questionId].forEach((option) => {
            allAnswers.push({
              question_id: questionId,
              answer_text: option,
              file_path: "",
            });
          });
        }
        // One choice
        else if (
          question.question_type === "one_choice" &&
          answers[questionId]
        ) {
          allAnswers.push({
            question_id: questionId,
            answer_text: answers[questionId],
            file_path: "",
          });
        }
        // File
        else if (question.question_type === "file" && answers[questionId]) {
          allAnswers.push({
            question_id: questionId,
            question_type: "file",
            answer_text: "", // No enviar el serial aquí
            file_path: answers[questionId],
          });
        }
        // Date
        else if (question.question_type === "date" && answers[questionId]) {
          allAnswers.push({
            question_id: questionId,
            answer_text: answers[questionId],
            file_path: "",
          });
        }
        // Number y otros tipos simples
        else if (
          question.question_type === "number" &&
          (Array.isArray(answers[questionId])
            ? answers[questionId]?.[0]
            : answers[questionId])
        ) {
          // Permite tanto array como string/number directo
          const value = Array.isArray(answers[questionId])
            ? answers[questionId][0]
            : answers[questionId];
          allAnswers.push({
            question_id: questionId,
            answer_text: value,
            file_path: "",
          });
        }
        // Location
        else if (question.question_type === "location" && answers[questionId]) {
          allAnswers.push({
            question_id: questionId,
            answer_text: answers[questionId],
            file_path: "",
          });
        }
      }

      if (allAnswers.length === 0) {
        Alert.alert("Error", "No hay respuestas para enviar");
        return;
      }

      const mode = await NetInfo.fetch().then((state) =>
        state.isConnected ? "online" : "offline"
      );

      if (mode === "offline") {
        // --- NUEVO: Guardar por separado para save-response y save-answers ---
        // Estructura para save-response
        const saveResponseData = {
          form_id: id,
          answers: allAnswers.map((a) => ({
            question_id: a.question_id,
            response: "", // string vacío para el primer envío
            file_path: a.file_path || "",
            repeated_id: "",
          })),
          mode: "offline",
          timestamp: Date.now(),
        };

        // Estructura para save-answers (cada respuesta individual)
        const saveAnswersData = allAnswers.map((a) => ({
          form_id: id,
          question_id: a.question_id,
          answer_text: a.answer_text,
          file_path: a.file_path || "",
          timestamp: Date.now(),
        }));

        // Guardar en AsyncStorage por separado
        // Guardar save-response
        const storedPendingSaveResponse = await AsyncStorage.getItem(
          PENDING_SAVE_RESPONSE_KEY
        );
        const pendingSaveResponse = storedPendingSaveResponse
          ? JSON.parse(storedPendingSaveResponse)
          : [];
        pendingSaveResponse.push(saveResponseData);
        await AsyncStorage.setItem(
          PENDING_SAVE_RESPONSE_KEY,
          JSON.stringify(pendingSaveResponse)
        );

        // Guardar save-answers
        const storedPendingSaveAnswers = await AsyncStorage.getItem(
          PENDING_SAVE_ANSWERS_KEY
        );
        const pendingSaveAnswers = storedPendingSaveAnswers
          ? JSON.parse(storedPendingSaveAnswers)
          : [];
        pendingSaveAnswers.push(...saveAnswersData);
        await AsyncStorage.setItem(
          PENDING_SAVE_ANSWERS_KEY,
          JSON.stringify(pendingSaveAnswers)
        );

        // Guardar también para MyForms offline
        await saveCompletedFormAnswers({
          formId: id,
          answers: allAnswers,
          questions,
          mode: "offline",
        });

        Alert.alert(
          "Guardado Offline",
          "El formulario se guardó para envío automático cuando tengas conexión."
        );
        setSubmitting(false);
        router.back();
        return;
      }

      // Log de depuración con todas las respuestas antes de enviar
      console.log("📝 Respuestas a enviar:", allAnswers);

      // El backend espera un array de objetos con las claves: question_id, response, file_path, repeated_id
      const allAnswersForApi = allAnswers.map((a) => ({
        question_id: a.question_id,
        response: "", // string vacío para el primer envío
        file_path: a.file_path || "",
        repeated_id: "", // string vacío si no aplica
      }));

      // Definir requestOptions aquí
      const requestOptions = {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      };

      // Crear registro de respuesta y obtener response_id
      console.log("📡 Creando registro de respuesta...");
      const saveResponseRes = await fetch(
        // MODIFICACIÓN: Añadir &action=send_and_close a la URL
        `${backendUrl}/responses/save-response/${id}?mode=${mode}&action=send_and_close`,
        {
          method: "POST",
          headers: requestOptions.headers,
          body: JSON.stringify(allAnswersForApi),
        }
      );
      const saveResponseData = await saveResponseRes.json();
      console.log("✅ Registro de respuesta creado:", saveResponseData);
      const responseId = saveResponseData.response_id;

      if (!responseId) {
        let backendMsg = "";
        if (Array.isArray(saveResponseData.detail)) {
          backendMsg = saveResponseData.detail
            .map((d) => (typeof d === "object" ? JSON.stringify(d) : String(d)))
            .join("\n");
        } else if (typeof saveResponseData.detail === "object") {
          backendMsg = JSON.stringify(saveResponseData.detail);
        } else {
          backendMsg =
            saveResponseData.detail || JSON.stringify(saveResponseData);
        }
        throw new Error(
          "No se pudo obtener el ID de respuesta. Detalle: " + backendMsg
        );
      }

      // Enviar todas las respuestas con el response_id
      console.log("📤 Enviando respuestas de forma secuencial...");
      const results = await sendAnswers(allAnswers, responseId, requestOptions);

      // Verificar si hubo errores
      const hasErrors = results.some((result) => result.error);
      if (hasErrors) {
        throw new Error("Algunas respuestas no pudieron ser guardadas");
      }

      // Guardar también para MyForms online
      await saveCompletedFormAnswers({
        formId: id,
        answers: allAnswers,
        questions,
        mode: "online",
      });
      console.log(
        "[DEBUG][OFFLINE] Guardado en completed_form_answers para MyForms (online)",
        { formId: id, answers: allAnswers }
      );

      Alert.alert("Éxito ✅", "Formulario enviado correctamente");
      router.back();
    } catch (error) {
      console.error("❌ Error en el proceso de envío:", error);
      Alert.alert("Error", "No se pudo completar el envío del formulario");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMultipleChoiceChange = (questionId, option) => {
    setSelectedAnswers((prev) => {
      const currentAnswers = prev[questionId] || [];
      if (currentAnswers.includes(option)) {
        // Remove the option if it's already selected
        return {
          ...prev,
          [questionId]: currentAnswers.filter((o) => o !== option),
        };
      } else {
        // Add the option if it's not selected
        return { ...prev, [questionId]: [...currentAnswers, option] };
      }
    });
  };

  const handleOneChoiceChange = (questionId, option) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: [option], // Replace the current selection with the new one
    }));
  };

  // Detectar preguntas is_repeated
  useEffect(() => {
    if (questions.length > 0) {
      const repeated = questions.filter((q) => q.is_repeated);
      setIsRepeatedQuestions(repeated);
      setSingleRepeated(repeated.length === 1);
    }
  }, [questions]);

  // Inicializar respuestas bloqueadas para no repetidas tras el primer envío
  const lockNonRepeatedAnswers = () => {
    const locked = {};
    questions.forEach((q) => {
      if (!q.is_repeated) {
        if (q.question_type === "text") {
          locked[q.id] = textAnswers[q.id] || [""];
        } else if (q.question_type === "table") {
          locked[q.id] = tableAnswersState[q.id] || [""];
        } else {
          locked[q.id] = answers[q.id];
        }
      }
    });
    setFirstNonRepeatedAnswers(locked);
    setNonRepeatedLocked(true);
  };

  // Limpiar solo los campos is_repeated tras envío progresivo
  const clearRepeatedAnswers = () => {
    // Limpiar text/table/answers solo de is_repeated
    const newText = { ...textAnswers };
    const newTable = { ...tableAnswersState };
    const newAns = { ...answers };
    isRepeatedQuestions.forEach((q) => {
      if (q.question_type === "text") newText[q.id] = [""];
      if (q.question_type === "table") newTable[q.id] = [""];
      newAns[q.id] = q.question_type === "number" ? [""] : "";
    });
    setTextAnswers(newText);
    setTableAnswersState(newTable);
    setAnswers(newAns);
  };

  // Envío progresivo: solo envía los campos is_repeated y bloquea los demás tras el primer envío
  const handleProgressiveSubmit = async () => {
    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");
      const backendUrl = await getBackendUrl();
      const mode = await NetInfo.fetch().then((state) =>
        state.isConnected ? "online" : "offline"
      );

      // Respuestas de preguntas is_repeated
      const repeatedAnswers = [];
      for (const question of isRepeatedQuestions) {
        const questionId = question.id;
        if (
          question.question_type === "text" &&
          textAnswers[questionId]?.length > 0
        ) {
          const validAnswers = textAnswers[questionId].filter(
            (answer) => answer.trim() !== ""
          );
          validAnswers.forEach((answer) => {
            repeatedAnswers.push({
              question_id: questionId,
              answer_text: answer,
              file_path: "",
            });
          });
        } else if (
          question.question_type === "table" &&
          tableAnswersState[questionId]?.length > 0
        ) {
          const validAnswers = tableAnswersState[questionId].filter(
            (answer) => answer.trim() !== ""
          );
          validAnswers.forEach((answer) => {
            repeatedAnswers.push({
              question_id: questionId,
              answer_text: answer,
              file_path: "",
            });
          });
        } else if (
          question.question_type === "multiple_choice" &&
          Array.isArray(answers[questionId]) &&
          answers[questionId].length > 0
        ) {
          answers[questionId].forEach((option) => {
            repeatedAnswers.push({
              question_id: questionId,
              answer_text: option,
              file_path: "",
            });
          });
        } else if (
          question.question_type === "one_choice" &&
          answers[questionId]
        ) {
          repeatedAnswers.push({
            question_id: questionId,
            answer_text: answers[questionId],
            file_path: "",
          });
        } else if (question.question_type === "file" && answers[questionId]) {
          repeatedAnswers.push({
            question_id: questionId,
            question_type: "file",
            answer_text: "", // No enviar el serial aquí
            file_path: "",
          });
        } else if (question.question_type === "date" && answers[questionId]) {
          repeatedAnswers.push({
            question_id: questionId,
            answer_text: answers[questionId],
            file_path: "",
          });
        } else if (
          question.question_type === "number" &&
          (Array.isArray(answers[questionId])
            ? answers[questionId]?.[0]
            : answers[questionId])
        ) {
          const value = Array.isArray(answers[questionId])
            ? answers[questionId][0]
            : answers[questionId];
          repeatedAnswers.push({
            question_id: questionId,
            answer_text: value,
            file_path: "",
          });
        } else if (
          question.question_type === "location" &&
          answers[questionId]
        ) {
          repeatedAnswers.push({
            question_id: questionId,
            answer_text: answers[questionId],
            file_path: "",
          });
        }
      }

      // Siempre incluir respuestas de preguntas no repetidas (bloqueadas o no)
      let nonRepeatedAnswers = [];
      for (const question of questions) {
        if (!question.is_repeated) {
          const questionId = question.id;
          if (
            question.question_type === "text" &&
            (firstNonRepeatedAnswers[questionId]?.length > 0 ||
              textAnswers[questionId]?.length > 0)
          ) {
            const values =
              nonRepeatedLocked && firstNonRepeatedAnswers[questionId]
                ? firstNonRepeatedAnswers[questionId]
                : textAnswers[questionId];
            const validAnswers = (values || []).filter(
              (answer) => answer && answer.trim() !== ""
            );
            validAnswers.forEach((answer) => {
              nonRepeatedAnswers.push({
                question_id: questionId,
                answer_text: answer,
                file_path: "",
              });
            });
          } else if (
            question.question_type === "table" &&
            (firstNonRepeatedAnswers[questionId]?.length > 0 ||
              tableAnswersState[questionId]?.length > 0)
          ) {
            const values =
              nonRepeatedLocked && firstNonRepeatedAnswers[questionId]
                ? firstNonRepeatedAnswers[questionId]
                : tableAnswersState[questionId];
            const validAnswers = (values || []).filter(
              (answer) => answer && answer.trim() !== ""
            );
            validAnswers.forEach((answer) => {
              nonRepeatedAnswers.push({
                question_id: questionId,
                answer_text: answer,
                file_path: "",
              });
            });
          } else if (
            question.question_type === "multiple_choice" &&
            Array.isArray(
              nonRepeatedLocked && firstNonRepeatedAnswers[questionId]
                ? firstNonRepeatedAnswers[questionId]
                : answers[questionId]
            ) &&
            (nonRepeatedLocked && firstNonRepeatedAnswers[questionId]
              ? firstNonRepeatedAnswers[questionId]
              : answers[questionId]
            ).length > 0
          ) {
            const values =
              nonRepeatedLocked && firstNonRepeatedAnswers[questionId]
                ? firstNonRepeatedAnswers[questionId]
                : answers[questionId];
            values.forEach((option) => {
              nonRepeatedAnswers.push({
                question_id: questionId,
                answer_text: option,
                file_path: "",
              });
            });
          } else if (
            question.question_type === "one_choice" &&
            (nonRepeatedLocked && firstNonRepeatedAnswers[questionId]
              ? firstNonRepeatedAnswers[questionId]
              : answers[questionId])
          ) {
            const value =
              nonRepeatedLocked && firstNonRepeatedAnswers[questionId]
                ? firstNonRepeatedAnswers[questionId]
                : answers[questionId];
            if (value) {
              nonRepeatedAnswers.push({
                question_id: questionId,
                answer_text: value,
                file_path: "",
              });
            }
          } else if (
            question.question_type === "file" &&
            (nonRepeatedLocked && firstNonRepeatedAnswers[questionId]
              ? firstNonRepeatedAnswers[questionId]
              : answers[questionId])
          ) {
            const value =
              nonRepeatedLocked && firstNonRepeatedAnswers[questionId]
                ? firstNonRepeatedAnswers[questionId]
                : answers[questionId];
            if (value) {
              nonRepeatedAnswers.push({
                question_id: questionId,
                answer_text: "",
                file_path: value,
              });
            }
          } else if (
            question.question_type === "date" &&
            (nonRepeatedLocked && firstNonRepeatedAnswers[questionId]
              ? firstNonRepeatedAnswers[questionId]
              : answers[questionId])
          ) {
            const value =
              nonRepeatedLocked && firstNonRepeatedAnswers[questionId]
                ? firstNonRepeatedAnswers[questionId]
                : answers[questionId];
            if (value) {
              nonRepeatedAnswers.push({
                question_id: questionId,
                answer_text: value,
                file_path: "",
              });
            }
          } else if (
            question.question_type === "location" &&
            (nonRepeatedLocked && firstNonRepeatedAnswers[questionId]
              ? firstNonRepeatedAnswers[questionId]
              : answers[questionId])
          ) {
            const value =
              nonRepeatedLocked && firstNonRepeatedAnswers[questionId]
                ? firstNonRepeatedAnswers[questionId]
                : answers[questionId];
            if (value) {
              nonRepeatedAnswers.push({
                question_id: questionId,
                answer_text: value,
                file_path: "",
              });
            }
          } else if (
            question.question_type === "number" &&
            (nonRepeatedLocked && firstNonRepeatedAnswers[questionId]
              ? Array.isArray(firstNonRepeatedAnswers[questionId])
                ? firstNonRepeatedAnswers[questionId][0]
                : firstNonRepeatedAnswers[questionId]
              : Array.isArray(answers[questionId])
                ? answers[questionId][0]
                : answers[questionId])
          ) {
            const value =
              nonRepeatedLocked && firstNonRepeatedAnswers[questionId]
                ? Array.isArray(firstNonRepeatedAnswers[questionId])
                  ? firstNonRepeatedAnswers[questionId][0]
                  : firstNonRepeatedAnswers[questionId]
                : Array.isArray(answers[questionId])
                  ? answers[questionId][0]
                  : answers[questionId];
            if (value !== undefined && value !== null && value !== "") {
              nonRepeatedAnswers.push({
                question_id: questionId,
                answer_text: value,
                file_path: "",
              });
            }
          }
        }
      }

      // Enviar respuestas (siempre: no repetidas + repetidas)
      const allToSend = [...nonRepeatedAnswers, ...repeatedAnswers];

      if (allToSend.length === 0) {
        Alert.alert("Error", "No hay respuestas para enviar");
        setSubmitting(false);
        return;
      }

      if (mode === "offline") {
        // Guardar cada diligenciamiento progresivo como pendiente
        const storedPending = await AsyncStorage.getItem("pending_forms");
        const pendingForms = storedPending ? JSON.parse(storedPending) : [];
        pendingForms.push({
          id,
          responses: allToSend,
          timestamp: Date.now(),
        });
        await AsyncStorage.setItem(
          "pending_forms",
          JSON.stringify(pendingForms)
        );
        // Guardar también para MyForms (para mostrar en la app)
        await saveCompletedFormAnswers({
          formId: id,
          answers: allToSend,
          questions,
          mode: "offline",
        });

        // Bloquear campos no repetidos tras el primer envío
        if (!nonRepeatedLocked) lockNonRepeatedAnswers();

        // Limpiar solo los campos is_repeated
        clearRepeatedAnswers();

        // Guardar grupo de respuestas enviadas localmente para mostrar debajo
        const group = {};
        for (const question of isRepeatedQuestions) {
          const questionId = question.id;
          if (question.question_type === "text") {
            group[questionId] = [...(textAnswers[questionId] || [])];
          } else if (question.question_type === "table") {
            group[questionId] = [...(tableAnswersState[questionId] || [])];
          } else {
            group[questionId] = answers[questionId];
          }
        }
        setSubmittedRepeatedGroups((prev) => [...prev, group]);

        Alert.alert(
          "Guardado Offline",
          "Respuestas guardadas para envío automático cuando tengas conexión. Puedes seguir agregando más."
        );
        setSubmitting(false);
        return;
      }

      // ...enviar igual que en handleSubmitForm...
      const requestOptions = {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      };

      // Crear registro de respuesta y obtener response_id
      const saveResponseRes = await fetch(

        `${backendUrl}/responses/save-response/${id}?mode=${mode}&action=send_and_close`,
        {
          method: "POST",
          headers: requestOptions.headers,
          // **IMPORTANTE**: Quita 'mode' del cuerpo, solo debe contener las respuestas
          body: JSON.stringify(allAnswersForApi),
        }
      );
      const saveResponseData = await saveResponseRes.json();
      const responseId = saveResponseData.response_id;
      if (!responseId) throw new Error("No se pudo obtener el ID de respuesta");

      // Enviar todas las respuestas con el response_id
      await sendAnswers(allToSend, responseId, requestOptions);

      // Guardar también para MyForms (solo respuestas is_repeated)
      await saveCompletedFormAnswers({
        formId: id,
        answers: allToSend,
        questions,
        mode,
      });

      // Bloquear campos no repetidos tras el primer envío
      if (!nonRepeatedLocked) lockNonRepeatedAnswers();

      // Limpiar solo los campos is_repeated
      clearRepeatedAnswers();

      // Guardar grupo de respuestas enviadas localmente para mostrar debajo
      const group = {};
      for (const question of isRepeatedQuestions) {
        const questionId = question.id;
        if (question.question_type === "text") {
          group[questionId] = [...(textAnswers[questionId] || [])];
        } else if (question.question_type === "table") {
          group[questionId] = [...(tableAnswersState[questionId] || [])];
        } else {
          group[questionId] = answers[questionId];
        }
      }
      setSubmittedRepeatedGroups((prev) => [...prev, group]);

      Alert.alert(
        "Éxito ✅",
        "Respuestas enviadas. Puedes seguir agregando más."
      );
    } catch (error) {
      console.error("❌ Error en el proceso de envío:", error);
      Alert.alert("Error", "No se pudo completar el envío del formulario");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileUploadWithSerial = async (questionId) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (result && !result.canceled && result.assets?.[0]?.uri) {
        setFileUris((prev) => ({
          ...prev,
          [questionId]: result.assets[0].uri,
        }));
        handleAnswerChange(questionId, result.assets[0].uri);
        Alert.alert("Archivo seleccionado", `Ruta: ${result.assets[0].uri}`);
      } else if (result && result.canceled) {
        // Cancelado por el usuario, no hacer nada
      } else {
        Alert.alert("Error", "No se pudo seleccionar el archivo.");
      }
    } catch (error) {
      Alert.alert("Error", "No se pudo seleccionar el archivo.");
    }
  };

  // Generar serial (online/offline)
  const generateSerial = async (questionId) => {
    setGeneratingSerial(true);
    try {
      const isOnline = await NetInfo.fetch().then((state) => state.isConnected);
      let serial = "";
      const backendUrl = await getBackendUrl();
      if (isOnline) {
        const token = await AsyncStorage.getItem("authToken");
        const res = await fetch(
          `${backendUrl}/responses/file-serials/generate`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
        let data;
        try {
          data = await res.json();
        } catch (e) {
          console.error("❌ Error parseando respuesta de serial:", e);
          Alert.alert("Error", "No se pudo obtener el serial del servidor.");
          setGeneratingSerial(false);
          return;
        }
        serial = data && data.serial;
        if (!serial) {
          console.error("❌ Serial no recibido del backend. Respuesta:", data);
          Alert.alert(
            "Error",
            "No se pudo generar el serial. Intenta de nuevo."
          );
          setGeneratingSerial(false);
          return;
        }
        console.log("🟢 Serial generado ONLINE:", serial);
      } else {
        serial = "OFF-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
        console.log("🟠 Serial generado OFFLINE:", serial);
      }
      setFileSerials((prev) => ({ ...prev, [questionId]: serial }));
      setShowSerialModal({ visible: true, serial });
    } catch (e) {
      console.error("❌ Error generando serial:", e);
      Alert.alert("Error", "No se pudo generar el serial.");
    } finally {
      setGeneratingSerial(false);
    }
  };

  // Modal para archivo: abrir
  const openFileModal = (questionId) => {
    console.log(
      "🟢 Abriendo modal de archivo para pregunta:",
      questionId,
      "Serial actual:",
      fileSerials[questionId]
    );
    setFileModal({ visible: true, questionId });
  };

  // Modal para archivo: cerrar
  const closeFileModal = () => {
    console.log("🔴 Cerrando modal de archivo");
    setFileModal({ visible: false, questionId: null });
  };

  // Modal serial: cerrar
  const closeSerialModal = () => {
    console.log("🔴 Cerrando modal de serial");
    setShowSerialModal({ visible: false, serial: "" });
  };

  // NUEVO: Estado y función para campos tipo location
  const [locationError, setLocationError] = useState({});
  const handleCaptureLocation = async (questionId) => {
    setLocationError((prev) => ({ ...prev, [questionId]: null }));
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError((prev) => ({
          ...prev,
          [questionId]: "Permiso de ubicación denegado",
        }));
        Alert.alert("Permiso denegado", "Se requiere permiso de ubicación.");
        return;
      }
      let loc = await Location.getCurrentPositionAsync({});
      if (loc && loc.coords) {
        const value = `${loc.coords.latitude}, ${loc.coords.longitude}`;
        handleAnswerChange(questionId, value);
      }
    } catch (e) {
      setLocationError((prev) => ({
        ...prev,
        [questionId]: "No se pudo obtener la ubicación",
      }));
      Alert.alert("Error", "No se pudo obtener la ubicación.");
    }
  };

  useEffect(() => {
    console.log(
      "[DEBUG][RENDER] tableAnswersState:",
      JSON.stringify(tableAnswersState)
    );
  }, [tableAnswersState]);

  return (
    <LinearGradient colors={["#4B34C7", "#4B34C7"]} style={{ flex: 1 }}>
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          stickyHeaderIndices={[0]}
        >
          {/* Sticky Header con logo y título */}
          <View style={styles.stickyHeaderContainer}> {/* Nuevo contenedor para la barra de color */}
            <View style={styles.stickyHeader}>
              {((logoUrlParam && String(logoUrlParam).length > 0) || (formMeta.logo_url && String(formMeta.logo_url).length > 0)) ? (
                <View style={styles.logoContainer}>
                  <Image
                    source={{ uri: String(logoUrlParam || formMeta.logo_url) }}
                    style={styles.formLogo}
                    resizeMode="contain"
                  />
                </View>
              ) : null}

              <View style={styles.headerContent}>
                <Text style={styles.header}>
                  {title ? String(title).toUpperCase() : "TÍTULO DEL DOCUMENTO"}
                </Text>
                <Text style={styles.subHeader}>
                  {id ? `ID: 00${String(id)}` : "ID: N/A"}
                </Text>
              </View>
            </View>
            {/* Esta View crea la barra de color elegante en la parte inferior */}
            <View style={styles.accentBar} />
          </View>

    

          {/* Preguntas NO repetidas */}
          {questions.some((q) => !q.is_repeated) && (
            <View style={styles.questionsContainer}>
              {/* ...existing code... */}
              {loading ? (
                <Text style={styles.loadingText}>Cargando preguntas...</Text>
              ) : (
                questions
                  .filter((question) => !question.is_repeated)
                  .map((question) => {
                    const isLocked = nonRepeatedLocked;
                    // Fix: define relatedOptions for location questions
                    let relatedOptions = [];
                    if (question.question_type === "location") {
                      relatedOptions =
                        locationRelatedAnswers[question.id] || [];
                    }
                    return (
                      <View key={question.id} style={styles.questionContainer}>
                        {/* Mostrar el texto de la pregunta siempre */}
                        <Text style={styles.questionLabel}>
                          {question.question_text}
                          {question.required && (
                            <Text style={styles.requiredText}> *</Text>
                          )}
                        </Text>
                        {/* Text */}
                        {question.question_type === "text" && (
                          <>
                            {textAnswers[question.id]?.map((field, index) => (
                              <View
                                key={index}
                                style={styles.dynamicFieldContainer}
                              >
                                <TextInput
                                  style={styles.input}
                                  placeholder="Escribe tu respuesta"
                                  value={field}
                                  onChangeText={(text) =>
                                    !isLocked &&
                                    handleTextChange(question.id, index, text)
                                  }
                                  editable={!isLocked}
                                />
                              </View>
                            ))}
                          </>
                        )}
                        {/* File */}
                        {question.question_type === "file" && (
                          <View
                            style={{
                              flexDirection: "column",
                              alignItems: "flex-start",
                              width: "100%",
                            }}
                          >
                            <TouchableOpacity
                              style={[
                                styles.fileButton,
                                fileUris[question.id] && {
                                  backgroundColor: "#20B46F",
                                }, // Verde si ya hay archivo
                              ]}
                              onPress={async () => {
                                if (!isLocked) {
                                  await handleFileButtonPress(question.id);
                                }
                              }}
                              disabled={isLocked}
                            >
                              <Text style={styles.fileButtonText}>
                                {fileUris[question.id]
                                  ? "Archivo seleccionado"
                                  : "Subir archivo"}
                              </Text>
                            </TouchableOpacity>
                            {/* Mostrar serial SIEMPRE debajo del campo */}
                            {fileSerials[question.id] ? (
                              <View style={{ marginTop: 6, marginLeft: 2 }}>
                                <Text style={{ color: "#2563eb", fontWeight: "bold", fontSize: 13 }}>
                                  Serial asignado: {String(fileSerials[question.id] || "")}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        )}
                        {/* Table */}
                        {question.question_type === "table" && (
                          <>
                            {tableAnswersState[question.id]?.map(
                              (field, index) => (
                                <View
                                  key={index}
                                  style={styles.dynamicFieldContainer}
                                >
                                  <View style={styles.pickerSearchWrapper}>
                                    <TextInput
                                      style={styles.pickerSearchInput}
                                      placeholder="Buscar opción..."
                                      value={
                                        pickerSearch[
                                        `${question.id}_${index}`
                                        ] || ""
                                      }
                                      onChangeText={(text) =>
                                        setPickerSearch((prev) => ({
                                          ...prev,
                                          [`${question.id}_${index}`]: text,
                                        }))
                                      }
                                      editable={!isLocked}
                                    />
                                  </View>
                                  <Picker
                                    selectedValue={field}
                                    onValueChange={(selectedValue) =>
                                      !isLocked &&
                                      handleTableSelectChangeWithCorrelation(
                                        question.id,
                                        index,
                                        selectedValue
                                      )
                                    }
                                    style={[
                                      styles.picker,
                                      tableAutoFilled[question.id] &&
                                      tableAutoFilled[question.id][index] && {
                                        backgroundColor: "#e6fafd", // Color especial si autocompletado
                                        borderColor: "#22c55e",
                                      },
                                    ]}
                                    enabled={!isLocked}
                                  >
                                    <Picker.Item
                                      label="Selecciona una opción"
                                      value=""
                                    />
                                    {Array.isArray(tableAnswers[question.id]) &&
                                      tableAnswers[question.id]
                                        .filter((option) =>
                                          (pickerSearch[
                                            `${question.id}_${index}`
                                          ] || "") === ""
                                            ? true
                                            : option
                                              .toLowerCase()
                                              .includes(
                                                pickerSearch[
                                                  `${question.id}_${index}`
                                                ]?.toLowerCase() || ""
                                              )
                                        )
                                        .map((option, i) => (
                                          <Picker.Item
                                            key={i}
                                            label={option}
                                            value={option}
                                          />
                                        ))}
                                  </Picker>
                                </View>
                              )
                            )}
                          </>
                        )}
                        {/* Multiple choice */}
                        {question.question_type === "multiple_choice" &&
                          question.options && (
                            <View>
                              {question.options.map((option, index) => (
                                <View
                                  key={index}
                                  style={styles.checkboxContainer}
                                >
                                  <TouchableOpacity
                                    style={[
                                      styles.checkbox,
                                      answers[question.id]?.includes(option) &&
                                      styles.checkboxSelected,
                                    ]}
                                    onPress={() =>
                                      !isLocked &&
                                      setAnswers((prev) => {
                                        const currentAnswers =
                                          prev[question.id] || [];
                                        const updatedAnswers =
                                          currentAnswers.includes(option)
                                            ? currentAnswers.filter(
                                              (o) => o !== option
                                            )
                                            : [...currentAnswers, option];
                                        return {
                                          ...prev,
                                          [question.id]: updatedAnswers,
                                        };
                                      })
                                    }
                                    disabled={isLocked}
                                  >
                                    {answers[question.id]?.includes(option) && (
                                      <Text style={styles.checkboxCheckmark}>
                                        ✔
                                      </Text>
                                    )}
                                  </TouchableOpacity>
                                  <Text style={styles.checkboxLabel}>
                                    {option}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          )}
                        {/* One choice */}
                        {question.question_type === "one_choice" &&
                          question.options && (
                            <View>
                              {question.options.map((option, index) => (
                                <View
                                  key={index}
                                  style={styles.checkboxContainer}
                                >
                                  <TouchableOpacity
                                    style={[
                                      styles.checkbox,
                                      answers[question.id] === option &&
                                      styles.checkboxSelected,
                                    ]}
                                    onPress={() =>
                                      !isLocked &&
                                      setAnswers((prev) => ({
                                        ...prev,
                                        [question.id]: option,
                                      }))
                                    }
                                    disabled={isLocked}
                                  >
                                    {answers[question.id] === option && (
                                      <Text style={styles.checkboxCheckmark}>
                                        ✔
                                      </Text>
                                    )}
                                  </TouchableOpacity>
                                  <Text style={styles.checkboxLabel}>
                                    {option}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          )}
                        {/* Number */}
                        {question.question_type === "number" && (
                          <TextInput
                            style={styles.input}
                            placeholder="Escribe un número"
                            keyboardType="numeric"
                            value={answers[question.id]?.[0] || ""}
                            onChangeText={(value) =>
                              !isLocked &&
                              setAnswers((prev) => ({
                                ...prev,
                                [question.id]: [value],
                              }))
                            }
                            editable={!isLocked}
                          />
                        )}
                        {/* Date */}
                        {question.question_type === "date" && (
                          <>
                            <TouchableOpacity
                              style={styles.dateButton}
                              onPress={() =>
                                !isLocked &&
                                setDatePickerVisible((prev) => ({
                                  ...prev,
                                  [question.id]: true,
                                }))
                              }
                              disabled={isLocked}
                            >
                              <Text style={styles.dateButtonText}>
                                {answers[question.id] || "Seleccionar fecha"}
                              </Text>
                            </TouchableOpacity>
                            {datePickerVisible[question.id] && (
                              <DateTimePicker
                                value={
                                  answers[question.id]
                                    ? new Date(answers[question.id])
                                    : new Date()
                                }
                                mode="date"
                                display="default"
                                onChange={(event, selectedDate) =>
                                  !isLocked &&
                                  handleDateChange(question.id, selectedDate)
                                }
                              />
                            )}
                          </>
                        )}
                        {/* Location */}
                        {question.question_type === "location" && (
                          <View style={{ width: "100%", marginBottom: 8 }}>
                            {/* Captura de coordenadas */}
                            <TouchableOpacity
                              style={[
                                styles.locationButton,
                                answers[question.id] && {
                                  backgroundColor: "#22c55e",
                                },
                              ]}
                              onPress={() => handleCaptureLocation(question.id)}
                              disabled={isLocked}
                            >
                              <Text style={styles.locationButtonText}>
                                {answers[question.id]
                                  ? "Ubicación capturada"
                                  : "Capturar ubicación"}
                              </Text>
                            </TouchableOpacity>
                            <TextInput
                              style={styles.input}
                              value={answers[question.id] || ""}
                              placeholder="Latitud, Longitud"
                              editable={false}
                              selectTextOnFocus={false}
                            />
                            {/* NUEVO: Si hay related answers, mostrar Picker */}
                            {relatedOptions.length > 0 && (
                              <View style={{ marginTop: 8 }}>
                                <Text
                                  style={{
                                    color: "#2563eb",
                                    fontWeight: "bold",
                                    marginBottom: 4,
                                  }}
                                >
                                  Selecciona una ubicación relacionada:
                                </Text>
                                <Picker
                                  selectedValue={
                                    locationSelected[question.id] || ""
                                  }
                                  onValueChange={(val) => {
                                    setLocationSelected((prev) => ({
                                      ...prev,
                                      [question.id]: val,
                                    }));
                                    setAnswers((prev) => ({
                                      ...prev,
                                      [question.id]: val,
                                    }));
                                  }}
                                  style={styles.picker}
                                  enabled={!isLocked}
                                >
                                  <Picker.Item
                                    label="Selecciona una ubicación"
                                    value=""
                                  />
                                  {relatedOptions.map((opt, idx) => (
                                    <Picker.Item
                                      key={idx}
                                      label={String(opt.label || "") + " (" + String(opt.value || "") + ")"}
                                      value={String(opt.value || "")}
                                    />
                                  ))}
                                </Picker>
                              </View>
                            )}
                            {locationError[question.id] && (
                              <Text style={{ color: "#ef4444", fontSize: 13 }}>
                                {locationError[question.id]}
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })
              )}
            </View>
          )}

          {/* Preguntas REPETIDAS */}
          {isRepeatedQuestions.length > 0 && (
            <View style={[styles.questionsContainer, { marginTop: 20 }]}>
              {/* ...existing code... */}
              {loading ? (
                <Text style={styles.loadingText}>Cargando preguntas...</Text>
              ) : (
                isRepeatedQuestions.map((question) => {
                  const isLocked = false;
                  const allowAddRemove = isRepeatedQuestions.length === 1;
                  // Fix: define relatedOptions for location questions
                  let relatedOptions = [];
                  if (question.question_type === "location") {
                    relatedOptions = locationRelatedAnswers[question.id] || [];
                  }
                  return (
                    <View key={question.id} style={styles.questionContainer}>
                      {/* Mostrar el texto de la pregunta siempre */}
                      <Text style={styles.questionLabel}>
                        {question.question_text}
                        {question.required && (
                          <Text style={styles.requiredText}> *</Text>
                        )}
                      </Text>
                      {/* Text */}
                      {question.question_type === "text" && (
                        <>
                          {textAnswers[question.id]?.map((field, index) => (
                            <View
                              key={index}
                              style={styles.dynamicFieldContainer}
                            >
                              <TextInput
                                style={styles.input}
                                placeholder="Escribe tu respuesta"
                                value={field}
                                onChangeText={(text) =>
                                  !isLocked &&
                                  handleTextChange(question.id, index, text)
                                }
                                editable={!isLocked}
                              />
                              {allowAddRemove && (
                                <TouchableOpacity
                                  style={styles.removeButton}
                                  onPress={() =>
                                    handleRemoveTextField(question.id, index)
                                  }
                                >
                                  <Text style={styles.removeButtonText}>-</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          ))}
                          {allowAddRemove && (
                            <TouchableOpacity
                              style={styles.addButton}
                              onPress={() => handleAddTextField(question.id)}
                            >
                              <Text style={styles.addButtonText}>+</Text>
                            </TouchableOpacity>
                          )}
                        </>
                      )}
                      {/* File */}
                      {question.question_type === "file" && (
                        <View
                          style={{
                            flexDirection: "column",
                            alignItems: "flex-start",
                            width: "100%",
                          }}
                        >
                          <TouchableOpacity
                            style={[
                              styles.fileButton,
                              fileUris[question.id] && {
                                backgroundColor: "#20B46F",
                              },
                            ]}
                            onPress={async () =>
                              !isLocked && openFileModal(question.id)
                            }
                            disabled={isLocked}
                          >
                            <Text style={styles.fileButtonText}>
                              {fileUris[question.id]
                                ? "Archivo seleccionado"
                                : "Subir archivo"}
                            </Text>
                          </TouchableOpacity>
                          {fileSerials[question.id] && (
                            <View style={{ marginTop: 6, marginLeft: 2 }}>
                              <Text
                                style={{
                                  color: "#2563eb",
                                  fontWeight: "bold",
                                  fontSize: 13,
                                }}
                              >
                                Serial asignado: {fileSerials[question.id]}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                      {/* Table */}
                      {question.question_type === "table" && (
                        <>
                          {tableAnswersState[question.id]?.map(
                            (field, index) => (
                              <View
                                key={index}
                                style={styles.dynamicFieldContainer}
                              >
                                <View style={styles.pickerSearchWrapper}>
                                  <TextInput
                                    style={styles.pickerSearchInput}
                                    placeholder="Buscar opción..."
                                    value={
                                      pickerSearch[`${question.id}_${index}`] ||
                                      ""
                                    }
                                    onChangeText={(text) =>
                                      setPickerSearch((prev) => ({
                                        ...prev,
                                        [`${question.id}_${index}`]: text,
                                      }))
                                    }
                                    editable={!isLocked}
                                  />
                                </View>
                                <Picker
                                  selectedValue={field}
                                  onValueChange={(selectedValue) =>
                                    !isLocked &&
                                    handleTableSelectChangeWithCorrelation(
                                      question.id,
                                      index,
                                      selectedValue
                                    )
                                  }
                                  style={[
                                    styles.picker,
                                    tableAutoFilled[question.id] &&
                                    tableAutoFilled[question.id][index] && {
                                      backgroundColor: "#e6fafd", // Color especial si autocompletado
                                      borderColor: "#22c55e",
                                    },
                                  ]}
                                  enabled={!isLocked}
                                >
                                  <Picker.Item
                                    label="Selecciona una opción"
                                    value=""
                                  />
                                  {Array.isArray(tableAnswers[question.id]) &&
                                    tableAnswers[question.id]
                                      .filter((option) =>
                                        (pickerSearch[
                                          `${question.id}_${index}`
                                        ] || "") === ""
                                          ? true
                                          : option
                                            .toLowerCase()
                                            .includes(
                                              pickerSearch[
                                                `${question.id}_${index}`
                                              ]?.toLowerCase() || ""
                                            )
                                      )
                                      .map((option, i) => (
                                        <Picker.Item
                                          key={i}
                                          label={option}
                                          value={option}
                                        />
                                      ))}
                                </Picker>
                                {allowAddRemove && (
                                  <TouchableOpacity
                                    style={styles.removeButton}
                                    onPress={() =>
                                      handleRemoveTableAnswer(
                                        question.id,
                                        index
                                      )
                                    }
                                  >
                                    <Text style={styles.removeButtonText}>
                                      -
                                    </Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            )
                          )}
                          {allowAddRemove && (
                            <TouchableOpacity
                              style={styles.addButton}
                              onPress={() => handleAddTableAnswer(question.id)}
                            >
                              <Text style={styles.addButtonText}>+</Text>
                            </TouchableOpacity>
                          )}
                        </>
                      )}
                      {/* Multiple choice */}
                      {question.question_type === "multiple_choice" &&
                        question.options && (
                          <View>
                            {question.options.map((option, index) => (
                              <View
                                key={index}
                                style={styles.checkboxContainer}
                              >
                                <TouchableOpacity
                                  style={[
                                    styles.checkbox,
                                    answers[question.id]?.includes(option) &&
                                    styles.checkboxSelected,
                                  ]}
                                  onPress={() =>
                                    !isLocked &&
                                    setAnswers((prev) => {
                                      const currentAnswers =
                                        prev[question.id] || [];
                                      const updatedAnswers =
                                        currentAnswers.includes(option)
                                          ? currentAnswers.filter(
                                            (o) => o !== option
                                          )
                                          : [...currentAnswers, option];
                                      return {
                                        ...prev,
                                        [question.id]: updatedAnswers,
                                      };
                                    })
                                  }
                                  disabled={isLocked}
                                >
                                  {answers[question.id]?.includes(option) && (
                                    <Text style={styles.checkboxCheckmark}>
                                      ✔
                                    </Text>
                                  )}
                                </TouchableOpacity>
                                <Text style={styles.checkboxLabel}>
                                  {option}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      {/* One choice */}
                      {question.question_type === "one_choice" &&
                        question.options && (
                          <View>
                            {question.options.map((option, index) => (
                              <View
                                key={index}
                                style={styles.checkboxContainer}
                              >
                                <TouchableOpacity
                                  style={[
                                    styles.checkbox,
                                    answers[question.id] === option &&
                                    styles.checkboxSelected,
                                  ]}
                                  onPress={() =>
                                    !isLocked &&
                                    setAnswers((prev) => ({
                                      ...prev,
                                      [question.id]: option,
                                    }))
                                  }
                                  disabled={isLocked}
                                >
                                  {answers[question.id] === option && (
                                    <Text style={styles.checkboxCheckmark}>
                                      ✔
                                    </Text>
                                  )}
                                </TouchableOpacity>
                                <Text style={styles.checkboxLabel}>
                                  {option}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      {/* Number */}
                      {question.question_type === "number" && (
                        <TextInput
                          style={styles.input}
                          placeholder="Escribe un número"
                          keyboardType="numeric"
                          value={answers[question.id]?.[0] || ""}
                          onChangeText={(value) =>
                            !isLocked &&
                            setAnswers((prev) => ({
                              ...prev,
                              [question.id]: [value],
                            }))
                          }
                          editable={!isLocked}
                        />
                      )}
                      {/* Date */}
                      {question.question_type === "date" && (
                        <>
                          <TouchableOpacity
                            style={styles.dateButton}
                            onPress={() =>
                              !isLocked &&
                              setDatePickerVisible((prev) => ({
                                ...prev,
                                [question.id]: true,
                              }))
                            }
                            disabled={isLocked}
                          >
                            <Text style={styles.dateButtonText}>
                              {answers[question.id] || "Seleccionar fecha"}
                            </Text>
                          </TouchableOpacity>
                          {datePickerVisible[question.id] && (
                            <DateTimePicker
                              value={
                                answers[question.id]
                                  ? new Date(answers[question.id])
                                  : new Date()
                              }
                              mode="date"
                              display="default"
                              onChange={(event, selectedDate) =>
                                !isLocked &&
                                handleDateChange(question.id, selectedDate)
                              }
                            />
                          )}
                        </>
                      )}
                      {/* Location */}
                      {question.question_type === "location" && (
                        <View style={{ width: "100%", marginBottom: 8 }}>
                          <TouchableOpacity
                            style={[
                              styles.locationButton,
                              answers[question.id] && {
                                backgroundColor: "#22c55e",
                              },
                            ]}
                            onPress={() => handleCaptureLocation(question.id)}
                            disabled={isLocked}
                          >
                            <Text style={styles.locationButtonText}>
                              {answers[question.id]
                                ? "Ubicación capturada"
                                : "Capturar ubicación"}
                            </Text>
                          </TouchableOpacity>
                          <TextInput
                            style={styles.input}
                            value={answers[question.id] || ""}
                            placeholder="Latitud, Longitud"
                            editable={false}
                            selectTextOnFocus={false}
                          />
                          {/* NUEVO: Si hay related answers, mostrar Picker */}
                          {relatedOptions.length > 0 && (
                            <View style={{ marginTop: 8 }}>
                              <Text
                                style={{
                                  color: "#2563eb",
                                  fontWeight: "bold",
                                  marginBottom: 4,
                                }}
                              >
                                Selecciona una ubicación relacionada:
                              </Text>
                              <Picker
                                selectedValue={
                                  locationSelected[question.id] || ""
                                }
                                onValueChange={(val) => {
                                  setLocationSelected((prev) => ({
                                    ...prev,
                                    [question.id]: val,
                                  }));
                                  setAnswers((prev) => ({
                                    ...prev,
                                    [question.id]: val,
                                  }));
                                }}
                                style={styles.picker}
                                enabled={!isLocked}
                              >
                                <Picker.Item
                                  label="Selecciona una ubicación"
                                  value=""
                                />
                                {relatedOptions.map((opt, idx) => (
                                  <Picker.Item
                                    key={idx}
                                    label={String(opt.label || "") + " (" + String(opt.value || "") + ")"}
                                    value={String(opt.value || "")}
                                  />
                                ))}
                              </Picker>
                            </View>
                          )}
                          {locationError[question.id] && (
                            <Text style={{ color: "#ef4444", fontSize: 13 }}>
                              {locationError[question.id]}
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* Mostrar grupos de respuestas enviadas en modo progresivo */}
          {isRepeatedQuestions.length > 1 &&
            submittedRepeatedGroups.length > 0 && (
              <View style={styles.submittedGroupsContainer}>
                <Text style={styles.submittedGroupsTitle}>
                  Formularios diligenciados:
                </Text>
                <View style={{ maxHeight: height * 0.25 }}>
                  <ScrollView
                    contentContainerStyle={{ paddingBottom: 10 }}
                    nestedScrollEnabled
                  >
                    {submittedRepeatedGroups.map((group, idx) => (
                      <View key={idx} style={styles.submittedGroupCard}>
                        <Text style={styles.submittedGroupHeader}>
                          Formulario diligenciado #{idx + 1}
                        </Text>
                        {isRepeatedQuestions.map((q) => (
                          <View key={q.id} style={styles.submittedGroupRow}>
                            <Text style={styles.submittedGroupQuestion}>
                              {q.question_text}:
                            </Text>
                            <View style={styles.submittedGroupAnswerBox}>
                              {Array.isArray(group[q.id])
                                ? group[q.id]
                                  .filter((ans) => ans && ans !== "")
                                  .map((ans, i) => (
                                    <Text
                                      key={i}
                                      style={styles.submittedGroupAnswer}
                                      numberOfLines={1}
                                      ellipsizeMode="tail"
                                    >
                                      {ans}
                                    </Text>
                                  ))
                                : group[q.id] && (
                                  <Text
                                    style={styles.submittedGroupAnswer}
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                  >
                                    {group[q.id]}
                                  </Text>
                                )}
                            </View>
                          </View>
                        ))}
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </View>
            )}

          {/* Botón de envío normal si solo hay una pregunta is_repeated */}
          {isRepeatedQuestions.length <= 1 && (
            <TouchableOpacity
              style={styles.submitButton}
              onPress={submitting ? null : handleSubmitForm}
              disabled={submitting}
            >
              {submitting ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Animated.View style={{ transform: [{ rotate: spin }] }}>
                    <SvgXml xml={spinnerSvg} width={40} height={40} />
                  </Animated.View>
                  <Text style={styles.submitButtonText}>Enviando...</Text>
                </View>
              ) : (
                <Text style={styles.submitButtonText}>Guardar Formulario</Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.push("/home")}
            disabled={submitting}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <HomeIcon color={"white"} />
              <Text style={[styles.backButtonText, { marginLeft: 8 }]}>Home</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
        {/* ...existing modals... */}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({


  container: {
    flex: 1,
    backgroundColor: "#F8F9FC"
  },
  scrollContent: {
    paddingHorizontal: width * 0.045,
    paddingTop: 8,
    paddingBottom: height * 0.08,
    flexGrow: 1,
  },
  // Asumiendo que 'width' es la dimensión de la pantalla importada de Dimensions
  // Definimos el color primario

  stickyHeaderContainer: {
    backgroundColor: "#FFFFFF",
    zIndex: 10,
    // Esta vez, no hay sombra en el encabezado principal
    shadowColor: "transparent",
    elevation: 0,
  },

  stickyHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16, // Más compacto
    paddingHorizontal: 20,
  },

  logoContainer: {
    marginRight: 12, // Menos espacio, acercando el logo al texto
    // Fondo muy claro para el logo, sutilmente diferente del blanco
    backgroundColor: '#F7F7F7',
    borderRadius: 4,
    padding: 4, // Un padding interno sutil para "enmarcar" el logo
  },

  formLogo: {
    width: 48, // Mucho más discreto y pequeño
    height: 48,
    borderRadius: 4, // Bordes cuadrados para un look más moderno
    backgroundColor: 'transparent',
  },

  headerContent: {
    flex: 1,
    justifyContent: 'center',
  },

  header: {
    // El texto es el protagonista
    fontSize: width * 0.046,
    fontWeight: "600", // Semi-negrita (más legible que la negrita total)
    color: DARK_GRAY, // Contraste máximo
    marginBottom: 2,
    letterSpacing: 0.1, // Tracking muy sutil
  },

  subHeader: {
    fontSize: width * 0.032, // Muy pequeño y discreto
    fontWeight: "500",
    color: MEDIUM_GRAY, // Gris oscuro para profesionalismo
  },

  // --- La clave de este diseño: la barra de acento ---
  accentBar: {
    height: 3, // Barra delgada
    backgroundColor: PRIMARY_BLUE, // Color corporativo
    width: '100%',
    // Sombra muy ligera para dar un poco de profundidad a la barra
    shadowColor: PRIMARY_BLUE,
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },

  questionsContainer: {
    backgroundColor: "#FFFFFF",
    marginBottom: 16,
    marginTop: 12,
    paddingTop: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingBottom: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EBF0",
    shadowColor: "#1F2937",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    overflow: "hidden",
  },
  loadingText: {
    fontSize: width * 0.042,
    textAlign: "center",
    marginVertical: height * 0.02,
    color: "#9CA3AF",
    fontWeight: "400",
  },
  questionContainer: {
    marginBottom: 0,
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  questionLabel: {
    fontSize: width * 0.042,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 14,
    lineHeight: width * 0.052,
  },
  requiredText: {
    color: "#EF4444",
    fontWeight: "600",
    marginLeft: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingVertical: height * 0.016,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    fontSize: width * 0.04,
    width: "100%",
    marginBottom: 8,
    color: "#1F2937",
    fontWeight: "400",
  },
  picker: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    marginTop: 4,
    width: "100%",
    color: "#1F2937",
    fontWeight: "400",
  },
  pickerSearchWrapper: {
    width: "100%",
    marginBottom: 8,
  },
  pickerSearchInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingVertical: height * 0.012,
    paddingHorizontal: 14,
    marginBottom: 6,
    backgroundColor: "#FFFFFF",
    fontSize: width * 0.038,
    width: "100%",
    fontWeight: "400",
    color: "#6B7280",
  },
  fileButton: {
    backgroundColor: "#4F46E5",
    paddingVertical: height * 0.018,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: "center",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    width: "100%",
    marginTop: 6,
    shadowColor: "#4F46E5",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  fileButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: width * 0.04,
    letterSpacing: 0.1,
  },
  dateButton: {
    backgroundColor: "#F59E0B",
    paddingVertical: height * 0.018,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
    borderColor: "#E5E7EB",
    borderWidth: 1,
    width: "100%",
    shadowColor: "#F59E0B",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  dateButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: width * 0.04,
    letterSpacing: 0.1,
  },
  locationButton: {
    backgroundColor: "#10B981",
    borderRadius: 10,
    paddingVertical: 15,
    paddingHorizontal: 18,
    alignItems: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    width: "100%",
    shadowColor: "#10B981",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  locationButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: width * 0.04,
    textAlign: "center",
    letterSpacing: 0.1,
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    paddingVertical: 6,
  },
  checkbox: {
    width: width * 0.06,
    height: width * 0.06,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    backgroundColor: "#FFFFFF",
  },
  checkboxSelected: {
    backgroundColor: "#4F46E5",
    borderColor: "#4F46E5",
  },
  checkboxCheckmark: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: width * 0.036,
  },
  checkboxLabel: {
    fontSize: width * 0.04,
    color: "#374151",
    fontWeight: "400",
    flex: 1,
  },
  dynamicFieldContainer: {
    flexDirection: "column",
    alignItems: "flex-start",
    marginTop: 6,
    marginBottom: 10,
    width: "100%",
    justifyContent: "flex-start",
  },
  addButton: {
    backgroundColor: "#10B981",
    paddingVertical: height * 0.015,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
    borderColor: "#E5E7EB",
    borderWidth: 1,
    alignSelf: "flex-start",
    shadowColor: "#10B981",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: width * 0.038,
  },
  removeButton: {
    backgroundColor: "#EF4444",
    paddingVertical: height * 0.01,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 10,
    justifyContent: "center",
  },
  removeButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: width * 0.036,
  },
  submitButton: {
    marginTop: height * 0.03,
    paddingVertical: height * 0.022,
    backgroundColor: "#4F46E5",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    shadowColor: "#4F46E5",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    flexDirection: "row",
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: width * 0.045,
    letterSpacing: 0.3,

  },
  backButton: {
    marginTop: height * 0.015,
    paddingVertical: height * 0.018,
    backgroundColor: "#6B7280",
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 0,
    shadowColor: "#6B7280",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  backButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: width * 0.042,
    letterSpacing: 0.2,
  },
  submittedGroupsContainer: {
    marginTop: height * 0.02,
    marginBottom: height * 0.015,
    backgroundColor: "#F0F9FF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingVertical: 16,
    paddingHorizontal: 18,
    shadowColor: "#1F2937",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  submittedGroupsTitle: {
    fontWeight: "600",
    fontSize: width * 0.042,
    marginBottom: 12,
    color: "#1E40AF",
  },
  submittedGroupCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderColor: "#E5E7EB",
    borderWidth: 1,
    shadowColor: "#1F2937",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  submittedGroupHeader: {
    fontWeight: "600",
    fontSize: width * 0.037,
    marginBottom: 10,
    color: "#1E40AF",
    backgroundColor: "#F3F4F6",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  submittedGroupRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
    flexWrap: "wrap",
    paddingVertical: 4,
  },
  submittedGroupQuestion: {
    fontWeight: "600",
    fontSize: width * 0.035,
    color: "#4B5563",
    flexShrink: 1,
    maxWidth: "40%",
  },
  submittedGroupAnswerBox: {
    flex: 1,
    marginLeft: 10,
    flexDirection: "column",
  },
  submittedGroupAnswer: {
    fontSize: width * 0.035,
    color: "#1F2937",
    backgroundColor: "#F9FAFB",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
    maxWidth: "100%",
    borderLeftWidth: 3,
    borderLeftColor: "#4F46E5",
  },
  spinnerContainer: {
    width: 40,
    height: 40,
    backgroundColor: "transparent",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    width: "88%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    borderWidth: 0,
    shadowColor: "#1F2937",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
    color: "#1F2937",
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginHorizontal: 6,
    backgroundColor: "#4F46E5",
    shadowColor: "#4F46E5",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  modalButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
});