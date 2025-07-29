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
      // Preguntas
      const storedQuestions = await AsyncStorage.getItem(QUESTIONS_KEY);
 
      const offlineQuestions = storedQuestions
        ? JSON.parse(storedQuestions)
        : {};
      if (!offlineQuestions[formId]) {
        Alert.alert(
          "Modo Offline",
          "No hay preguntas guardadas para este formulario."
        );
        setLoading(false);
        return;
      }
      setQuestions(offlineQuestions[formId]);

      // Respuestas relacionadas para preguntas tipo tabla
      const storedRelated = await AsyncStorage.getItem(RELATED_ANSWERS_KEY);
      const offlineRelated = storedRelated ? JSON.parse(storedRelated) : {};
      // Carga para cada pregunta tipo tabla
      const tableAnswersObj = {};
      offlineQuestions[formId].forEach((q) => {
        if (q.question_type === "table") {
          const rel = offlineRelated[q.id];
          if (rel) {
            // Si la fuente es "pregunta_relacionada", los datos están en rel.data (array de objetos con { name })
            if (
              rel.source === "pregunta_relacionada" &&
              Array.isArray(rel.data)
            ) {
              tableAnswersObj[q.id] = rel.data.map((item) => item.name);
            }
            // Si la fuente es "usuarios", los datos están en rel.data (array de strings o nombres)
            else if (rel.source === "usuarios" && Array.isArray(rel.data)) {
              tableAnswersObj[q.id] = rel.data;
            }
            // Si la estructura es solo un array plano (compatibilidad)
            else if (Array.isArray(rel)) {
              tableAnswersObj[q.id] = rel;
            } else {
              tableAnswersObj[q.id] = [];
            }
          } else {
            tableAnswersObj[q.id] = [];
          }
        }
      });
      setTableAnswers(tableAnswersObj);
    } catch (error) {
      console.error("❌ Error cargando datos offline:", error);
      Alert.alert("Error", "No se pudieron cargar los datos offline.");
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

  const handleAddTableAnswer = (questionId) => {
    console.log(
      `➕ Agregando nuevo campo para pregunta tabla ID ${questionId}`
    );
    setTableAnswersState((prev) => ({
      ...prev,
      [questionId]: [...(prev[questionId] || []), ""],
    }));
  };

  const handleRemoveTableAnswer = (questionId, index) => {
    setTableAnswersState((prev) => ({
      ...prev,
      [questionId]: prev[questionId].filter((_, i) => i !== index),
    }));
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
        `${backendUrl}/responses/save-response/${id}?mode=${mode}`,
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
        `${backendUrl}/responses/save-response/${id}`,
        {
          method: "POST",
          headers: requestOptions.headers,
          body: JSON.stringify({ mode }),
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

  return (
    <LinearGradient colors={["#4B34C7", "#4B34C7"]} style={{ flex: 1 }}>
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          stickyHeaderIndices={[0]}
        >
          {/* Sticky Header con logo y título */}
          <View style={styles.stickyHeader}>
            {logoUrlParam || formMeta.logo_url ? (
              <Image
                source={{ uri: logoUrlParam || formMeta.logo_url }}
                style={styles.formLogo}
                resizeMode="contain"
              />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.header}>
                {title ? title.toLocaleUpperCase() : ""}
              </Text>
              <Text style={styles.subHeader}>ID: 00{id}</Text>
            </View>
          </View>

          <Text style={styles.instructions}>
            Responde las preguntas a continuación:
          </Text>
          <Text style={styles.instructions}>
            Recuerda que puedes subir archivos (si es necesario).
          </Text>

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
                                      handleTableSelectChange(
                                        question.id,
                                        index,
                                        selectedValue
                                      )
                                    }
                                    style={styles.picker}
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
                                    handleTableSelectChange(
                                      question.id,
                                      index,
                                      selectedValue
                                    )
                                  }
                                  style={styles.picker}
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
                <>
                  <Animated.View style={{ transform: [{ rotate: spin }] }}>
                    <SvgXml xml={spinnerSvg} width={40} height={40} />
                  </Animated.View>
                  <Text style={styles.submitButtonText}>Enviando...</Text>
                </>
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
            <Text style={styles.backButtonText}>
              <HomeIcon color={"white"} />
              {"  "}
              Home
            </Text>
          </TouchableOpacity>
        </ScrollView>
        {/* ...existing modals... */}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7fafc" },
  scrollContent: {
    padding: width * 0.05,
    paddingBottom: height * 0.05,
    flexGrow: 1,
  },
  header: {
    fontSize: width * 0.065,
    fontWeight: "bold",
    color: "#4B34C7",
    marginBottom: height * 0.02,
    textAlign: "center",
    letterSpacing: 0.5,
    textShadowColor: "#12A0AF22",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subHeader: {
    fontSize: width * 0.045,
    fontWeight: "bold",
    color: "#12A0AF",
    marginBottom: height * 0.01,
    textAlign: "center",
  },
  instructions: {
    fontSize: width * 0.042,
    color: "#4B34C7",
    marginBottom: height * 0.01,
    textAlign: "center",
  },
  questionsContainer: {
    backgroundColor: "#fff",
    marginBottom: height * 0.02,
    padding: 14,
    borderRadius: width * 0.03,
    borderColor: "#12A0AF",
    borderWidth: 1.5,
    shadowColor: "#12A0AF",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  loadingText: {
    fontSize: width * 0.05,
    textAlign: "center",
    marginVertical: height * 0.02,
    color: "#12A0AF",
  },
  questionContainer: { marginBottom: height * 0.025 },
  questionLabel: {
    fontSize: width * 0.048,
    fontWeight: "bold",
    color: "#4B34C7",
    marginBottom: height * 0.01,
  },
  requiredText: {
    color: "#ef4444",
    fontWeight: "bold",
    marginLeft: width * 0.01,
  },
  submitButton: {
    marginTop: height * 0.03,
    padding: height * 0.022,
    backgroundColor: "#12A0AF",
    borderRadius: width * 0.025,
    alignItems: "center",
    borderColor: "#4B34C7",
    borderWidth: 1.5,
    shadowColor: "#12A0AF",
    shadowOpacity: 0.13,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  submitButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.048,
    letterSpacing: 0.2,
  },
  backButton: {
    marginTop: height * 0.02,
    padding: height * 0.018,
    backgroundColor: "#EB2525FF",
    borderRadius: width * 0.025,
    alignItems: "center",
    borderColor: "#4B34C7",
    borderWidth: 1.5,
    shadowColor: "#EB2525FF",
    shadowOpacity: 0.13,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  backButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
    letterSpacing: 0.2,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#12A0AF",
    borderRadius: width * 0.02,
    padding: height * 0.015,
    backgroundColor: "#f3f4f6",
    fontSize: width * 0.045,
    width: width * 0.75,
    marginBottom: 6,
    color: "#222",
  },
  picker: {
    borderWidth: 1.5,
    borderColor: "#12A0AF",
    borderRadius: width * 0.02,
    backgroundColor: "#f3f4f6",
    marginTop: 0,
    width: "100%",
    color: "#222",
  },
  fileButton: {
    backgroundColor: "#9225EBFF",
    padding: height * 0.018,
    borderRadius: width * 0.02,
    alignItems: "center",
    borderColor: "#12A0AF",
    borderWidth: 1.5,
    width: width * 0.75,
    marginTop: 4,
  },
  fileButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
  dateButton: {
    backgroundColor: "#EB9525FF",
    padding: height * 0.018,
    borderRadius: width * 0.02,
    alignItems: "center",
    marginTop: height * 0.01,
    borderColor: "#12A0AF",
    borderWidth: 1.5,
  },
  dateButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: height * 0.01,
  },
  checkbox: {
    width: width * 0.08,
    height: width * 0.08,
    borderWidth: 2,
    borderColor: "#12A0AF",
    borderRadius: width * 0.02,
    justifyContent: "center",
    alignItems: "center",
    marginRight: width * 0.03,
    backgroundColor: "#fff",
  },
  checkboxSelected: {
    backgroundColor: "#12A0AF",
    borderColor: "#4B34C7",
  },
  checkboxCheckmark: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.04,
  },
  checkboxLabel: {
    fontSize: width * 0.045,
    color: "#222",
  },
  dynamicFieldContainer: {
    flexDirection: "column",
    alignItems: "flex-start",
    marginTop: height * 0.01,
    marginBottom: height * 0.01,
    width: width * 0.75,
    justifyContent: "flex-start",
  },
  addButton: {
    backgroundColor: "#22c55e",
    padding: height * 0.018,
    borderRadius: width * 0.6,
    alignItems: "center",
    marginTop: height * 0.01,
    width: width * 0.14,
    borderColor: "#12A0AF",
    borderWidth: 1.5,
  },
  addButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
  removeButton: {
    backgroundColor: "#ef4444",
    padding: height * 0.012,
    borderRadius: width * 0.02,
    marginLeft: width * 0.02,
  },
  removeButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
  spinnerContainer: {
    width: 40,
    height: 40,
    backgroundColor: "transparent",
  },
  submittedGroupsContainer: {
    marginTop: height * 0.01,
    marginBottom: height * 0.01,
    backgroundColor: "#e6fafd",
    borderRadius: width * 0.02,
    borderColor: "#12A0AF",
    borderWidth: 1.5,
    padding: width * 0.025,
    maxWidth: "100%",
  },
  submittedGroupsTitle: {
    fontWeight: "bold",
    fontSize: width * 0.045,
    marginBottom: height * 0.01,
    color: "#12A0AF",
  },
  submittedGroupCard: {
    backgroundColor: "#fff",
    borderRadius: width * 0.015,
    padding: width * 0.02,

    marginBottom: height * 0.01,
    borderColor: "#12A0AF",
    borderWidth: 1,
  },
  submittedGroupHeader: {
    fontWeight: "bold",
    fontSize: width * 0.038,
    marginBottom: height * 0.005,
    color: "#4B34C7",
  },
  submittedGroupRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: height * 0.005,
    flexWrap: "wrap",
  },
  submittedGroupQuestion: {
    fontWeight: "bold",
    fontSize: width * 0.035,
    color: "#12A0AF",
    flexShrink: 1,
    maxWidth: "45%",
  },
  submittedGroupAnswerBox: {
    flex: 1,
    marginLeft: width * 0.01,
    flexDirection: "column",
    flexWrap: "wrap",
  },
  submittedGroupAnswer: {
    fontSize: width * 0.035,
    color: "#222",
    backgroundColor: "#f7fafc",
    borderRadius: width * 0.01,
    paddingHorizontal: width * 0.01,
    marginBottom: 2,
    maxWidth: "100%",
  },
  pickerSearchWrapper: {
    width: "100%",
    marginBottom: 2,
  },
  pickerSearchInput: {
    borderWidth: 1,
    borderColor: "#bbb",
    borderRadius: width * 0.015,
    padding: height * 0.012,
    marginBottom: 4,
    backgroundColor: "#fff",
    fontSize: width * 0.04,
    width: "100%",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(18,160,175,0.13)",
  },
  modalContent: {
    width: "80%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 22,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#12A0AF",
    shadowColor: "#4B34C7",
    shadowOpacity: 0.13,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
    color: "#4B34C7",
  },
  modalButton: {
    flex: 1,
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
    marginHorizontal: 5,
    backgroundColor: "#12A0AF",
  },
  modalButtonText: {
    color: "white",
    fontSize: 15,
    fontWeight: "bold",
    textAlign: "center",
  },
  stickyHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    borderRadius: 12,
    zIndex: 10,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  formLogo: {
    width: 56, // Ajustado a 56px para mejor presencia en header
    height: 56,
    borderRadius: 12,
    marginRight: 14,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#12A0AF",
    alignSelf: "center",
  },
  locationButton: {
    backgroundColor: "#4B34C7",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: "#12A0AF",
    width: "75%",
    alignSelf: "flex-start",
  },
  locationButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: width * 0.045,
    textAlign: "center",
  },
});
