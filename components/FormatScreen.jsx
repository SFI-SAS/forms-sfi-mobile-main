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
const { width, height } = Dimensions.get("window"); // Get screen dimensions

const QUESTIONS_KEY = "offline_questions";
const FORMS_METADATA_KEY = "offline_forms_metadata";
const RELATED_ANSWERS_KEY = "offline_related_answers";

// Copia el SVG como string
const spinnerSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill="#000000FF" stroke="#EE4138FF" stroke-width="15" transform-origin="center" d="m148 84.7 13.8-8-10-17.3-13.8 8a50 50 0 0 0-27.4-15.9v-16h-20v16A50 50 0 0 0 63 67.4l-13.8-8-10 17.3 13.8 8a50 50 0 0 0 0 31.7l-13.8 8 10 17.3 13.8-8a50 50 0 0 0 27.5 15.9v16h20v-16a50 50 0 0 0 27.4-15.9l13.8 8 10-17.3-13.8-8a50 50 0 0 0 0-31.7Zm-47.5 50.8a35 35 0 1 1 0-70 35 35 0 0 1 0 70Z"><animateTransform type="rotate" attributeName="transform" calcMode="spline" dur="1.8" values="0;120" keyTimes="0;1" keySplines="0 0 1 1" repeatCount="indefinite"></animateTransform></path></svg>
`;

const INACTIVITY_TIMEOUT = 8 * 60 * 1000; // 8 minutos

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

export default function FormatScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams(); // Recibir el ID del formulario como parámetro
  const { title } = useLocalSearchParams(); // Recibir el título del formulario como parámetro
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

  useFocusEffect(
    React.useCallback(() => {
      const disableBack = () => true; // Disable hardware back button
      return () => {
        BackHandler.removeEventListener("hardwareBackPress", disableBack);
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
            if (rel.source === "pregunta_relacionada") {
              tableAnswersObj[q.id] = Array.isArray(rel.respuestas)
                ? rel.respuestas.map((item) => item.respuesta)
                : [];
            } else if (rel.source === "usuarios") {
              tableAnswersObj[q.id] = Array.isArray(rel.data) ? rel.data : [];
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

        const res = await fetch(
          `https://api-forms.sfisas.com.co/responses/save-answers/`,
          {
            method: "POST",
            headers: requestOptions.headers,
            body: JSON.stringify(responseData),
          }
        );

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
            console.log("🔗 Asociando serial al answer:", serialPayload);
            const serialRes = await fetch(
              "https://api-forms.sfisas.com.co/responses/file-serials/",
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

      const mode = await NetInfo.fetch().then((state) =>
        state.isConnected ? "online" : "offline"
      );

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
          answers[questionId]?.[0]
        ) {
          allAnswers.push({
            question_id: questionId,
            answer_text: answers[questionId][0],
            file_path: "",
          });
        }
      }

      if (allAnswers.length === 0) {
        Alert.alert("Error", "No hay respuestas para enviar");
        return;
      }

      if (mode === "offline") {
        // Guardar en pending_forms
        const storedPending = await AsyncStorage.getItem("pending_forms");
        const pendingForms = storedPending ? JSON.parse(storedPending) : [];
        pendingForms.push({
          id,
          responses: allAnswers,
          timestamp: Date.now(),
        });
        await AsyncStorage.setItem(
          "pending_forms",
          JSON.stringify(pendingForms)
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
        `https://api-forms.sfisas.com.co/responses/save-response/${id}`,
        {
          method: "POST",
          headers: requestOptions.headers,
          body: JSON.stringify({ mode }),
        }
      );

      const saveResponseData = await saveResponseRes.json();
      console.log("✅ Registro de respuesta creado:", saveResponseData);
      const responseId = saveResponseData.response_id;

      if (!responseId) {
        throw new Error("No se pudo obtener el ID de respuesta");
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
          answers[questionId]?.[0]
        ) {
          repeatedAnswers.push({
            question_id: questionId,
            answer_text: answers[questionId][0],
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
            question.question_type === "number" &&
            ((nonRepeatedLocked && firstNonRepeatedAnswers[questionId]?.[0]) ||
              answers[questionId]?.[0])
          ) {
            const value =
              nonRepeatedLocked && firstNonRepeatedAnswers[questionId]
                ? firstNonRepeatedAnswers[questionId][0]
                : answers[questionId][0];
            if (value) {
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
        `https://api-forms.sfisas.com.co/responses/save-response/${id}`,
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

  const resetInactivityTimer = async () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(async () => {
      await AsyncStorage.setItem("isLoggedOut", "true");
      setShowLogoutModal(true);
    }, INACTIVITY_TIMEOUT);
  };

  useEffect(() => {
    const reset = () => resetInactivityTimer();
    const touchListener = () => reset();
    const focusListener = () => reset();

    // React Native events
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      reset
    );
    const interval = setInterval(reset, 1000 * 60 * 4);

    reset();

    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      subscription.remove();
      clearInterval(interval);
    };
  }, []);

  // Generar serial (online/offline)
  const generateSerial = async (questionId) => {
    setGeneratingSerial(true);
    try {
      const isOnline = await NetInfo.fetch().then((state) => state.isConnected);
      let serial = "";
      if (isOnline) {
        const token = await AsyncStorage.getItem("authToken");
        const res = await fetch(
          "https://api-forms.sfisas.com.co/responses/file-serials/generate",
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

  // Subir archivo y asociar a pregunta
  const handleFileUploadWithSerial = async (questionId) => {
    console.log(
      "🟢 Subiendo archivo para pregunta:",
      questionId,
      "Serial:",
      fileSerials[questionId]
    );
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
        console.log("🟢 Archivo seleccionado:", result.assets[0].uri);
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

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.header}>{title.toLocaleUpperCase()}</Text>
        <Text style={styles.subHeader}>ID: 00{id}</Text>
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
                            onPress={() => {
                              console.log(
                                "🟢 Botón archivo presionado para pregunta:",
                                question.id
                              );
                              !isLocked && openFileModal(question.id);
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
                          onPress={() =>
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
                        {tableAnswersState[question.id]?.map((field, index) => (
                          <View
                            key={index}
                            style={styles.dynamicFieldContainer}
                          >
                            <View style={styles.pickerSearchWrapper}>
                              <TextInput
                                style={styles.pickerSearchInput}
                                placeholder="Buscar opción..."
                                value={
                                  pickerSearch[`${question.id}_${index}`] || ""
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
                                    (pickerSearch[`${question.id}_${index}`] ||
                                      "") === ""
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
                                  handleRemoveTableAnswer(question.id, index)
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
                            <View key={index} style={styles.checkboxContainer}>
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
                              <Text style={styles.checkboxLabel}>{option}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    {/* One choice */}
                    {question.question_type === "one_choice" &&
                      question.options && (
                        <View>
                          {question.options.map((option, index) => (
                            <View key={index} style={styles.checkboxContainer}>
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
                              <Text style={styles.checkboxLabel}>{option}</Text>
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
                  </View>
                );
              })
            )}
            {/* Botón de envío progresivo SOLO si hay más de una pregunta repetida */}
            {isRepeatedQuestions.length > 1 && (
              <TouchableOpacity
                style={styles.submitButton}
                onPress={submitting ? null : handleProgressiveSubmit}
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
                  <Text style={styles.submitButtonText}>Siguiente ➡</Text>
                )}
              </TouchableOpacity>
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
      {/* Modal de cierre de sesión por inactividad */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 10,
              padding: 24,
              width: width * 0.8,
              alignItems: "center",
              elevation: 5,
            }}
          >
            <Text
              style={{
                fontWeight: "bold",
                fontSize: width * 0.05,
                marginBottom: 8,
                color: "#222",
              }}
            >
              Sesión cerrada por inactividad
            </Text>
            <Text
              style={{
                fontSize: width * 0.04,
                color: "#444",
                marginBottom: 12,
                textAlign: "center",
              }}
            >
              Por seguridad, la sesión se cerró automáticamente.
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: "#2563eb",
                borderRadius: 6,
                padding: 12,
                alignItems: "center",
                width: "100%",
              }}
              onPress={() => {
                setShowLogoutModal(false);
                router.push("/");
              }}
            >
              <Text
                style={{
                  color: "white",
                  fontWeight: "bold",
                  fontSize: width * 0.045,
                }}
              >
                Volver a iniciar sesión
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Modal para generación de serial y subida de archivo */}
      <Modal
        visible={fileModal.visible}
        transparent
        animationType="fade"
        onRequestClose={closeFileModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {!fileSerials[fileModal.questionId] ? (
              <>
                <Text style={styles.modalTitle}>
                  ¿Desea generar un serial para este archivo?
                </Text>
                <View style={{ flexDirection: "row", marginTop: 10 }}>
                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: "#2563eb" }]}
                    onPress={async () => {
                      console.log(
                        "🟢 Opción SÍ para generar serial, pregunta:",
                        fileModal.questionId
                      );
                      await generateSerial(fileModal.questionId);
                    }}
                    disabled={generatingSerial}
                  >
                    <Text style={styles.modalButtonText}>
                      {generatingSerial ? "Generando..." : "Sí"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: "#aaa" }]}
                    onPress={closeFileModal}
                    disabled={generatingSerial}
                  >
                    <Text style={styles.modalButtonText}>No</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>
                  Serial asignado: {fileSerials[fileModal.questionId]}
                </Text>
                <View style={{ flexDirection: "row", marginTop: 10 }}>
                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: "#2563eb" }]}
                    onPress={async () => {
                      console.log(
                        "🟢 Botón SUBIR ARCHIVO visible, pregunta:",
                        fileModal.questionId,
                        "Serial:",
                        fileSerials[fileModal.questionId]
                      );
                      await handleFileUploadWithSerial(fileModal.questionId);
                    }}
                  >
                    <Text style={styles.modalButtonText}>Subir archivo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: "#aaa" }]}
                    onPress={closeFileModal}
                  >
                    <Text style={styles.modalButtonText}>Ok</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
      {/* Modal para mostrar el serial generado */}
      <Modal
        visible={showSerialModal.visible}
        transparent
        animationType="fade"
        onRequestClose={closeSerialModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>✅ Este es el serial asignado</Text>
            <Text
              style={{ fontWeight: "bold", fontSize: 18, marginVertical: 10 }}
            >
              {showSerialModal.serial}
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: "#2563eb" }]}
              onPress={closeSerialModal}
            >
              <Text style={styles.modalButtonText}>Continuar ✅</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  scrollContent: {
    padding: width * 0.05,
    paddingBottom: height * 0.05,
    flexGrow: 1,
  },
  header: {
    fontSize: width * 0.06,
    fontWeight: "bold",
    marginBottom: height * 0.02,
  },
  subHeader: {
    fontSize: width * 0.05,
    fontWeight: "bold",
    marginBottom: height * 0.02,
  },
  instructions: {
    fontSize: width * 0.045,
    marginBottom: height * 0.01,
  },
  questionsContainer: {
    // Elimina maxHeight para permitir scroll global
    backgroundColor: "#E4E4E4FF",
    color: "white",
    marginBottom: height * 0.02,
    padding: 9,
    borderRadius: width * 0.02,
    borderColor: "#000000FF",
    borderWidth: 1,
  },
  loadingText: {
    fontSize: width * 0.05,
    textAlign: "center",
    marginVertical: height * 0.02,
  },
  questionContainer: { marginBottom: height * 0.02 },
  questionLabel: {
    fontSize: width * 0.05,
    fontWeight: "bold",
    marginBottom: height * 0.01,
  },
  requiredText: {
    color: "red",
    fontWeight: "bold",
  },
  submitButton: {
    marginTop: height * 0.03,
    padding: height * 0.02,
    backgroundColor: "#4F87DBFF",
    borderRadius: width * 0.02,
    alignItems: "center",
    borderColor: "#000000FF",
    borderWidth: 1,
  },
  submitButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
  backButton: {
    marginTop: height * 0.02,
    padding: height * 0.02,
    backgroundColor: "red",
    borderRadius: width * 0.02,
    alignItems: "center",
    borderColor: "#000000FF",
    borderWidth: 1,
  },
  backButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: width * 0.02, // Dynamic border radius
    padding: height * 0.015, // Dynamic padding
    backgroundColor: "#f9f9f9",
    fontSize: width * 0.045, // Dynamic font size
    borderRadius: width * 0.02,
    borderColor: "#000000FF",
    borderWidth: 1,
    width: width * 0.75, // Dynamic width
  },
  picker: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: width * 0.75, // Dynamic border radius
    backgroundColor: "#f9f9f9",
    marginTop: 0,
    borderRadius: width * 0.02,
    borderColor: "#000000FF",
    borderWidth: 1,
    width: "100%",
  },
  fileButton: {
    backgroundColor: "#9225EBFF",
    padding: height * 0.02, // Dynamic padding
    borderRadius: width * 0.02, // Dynamic border radius
    alignItems: "center",
    borderColor: "#000000FF",
    borderWidth: 1,
    width: width * 0.75, // Dynamic width
  },
  fileButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045, // Dynamic font size
  },
  dateButton: {
    backgroundColor: "#EB9525FF",
    padding: height * 0.02, // Dynamic padding
    borderRadius: width * 0.02, // Dynamic border radius
    alignItems: "center",
    marginTop: height * 0.02,
    borderColor: "#000000FF",
    borderWidth: 1,
  },
  dateButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045, // Dynamic font size
  },
  requiredText: {
    color: "red",
    fontWeight: "bold",
    marginLeft: width * 0.01, // Dynamic margin
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: height * 0.01,
  },
  checkbox: {
    width: width * 0.08, // Dynamic size
    height: width * 0.08, // Dynamic size
    borderWidth: 3,
    borderColor: "#706C6CFF",
    borderRadius: width * 0.01, // Dynamic border radius
    justifyContent: "center",
    alignItems: "center",
    marginRight: width * 0.03, // Dynamic margin
  },
  checkboxSelected: {
    backgroundColor: "#20B46FFF",
    borderColor: "#020202FF",
  },
  checkboxCheckmark: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.04, // Dynamic font size
  },
  checkboxLabel: {
    fontSize: width * 0.045, // Dynamic font size
    color: "#333",
  },
  dynamicFieldContainer: {
    flexDirection: "column",
    alignItems: "flex-start",
    marginTop: height * 0.01,
    marginBottom: height * 0.01,
    width: width * 0.75, // Dynamic width
    justifyContent: "flex-start",
  },
  addButton: {
    backgroundColor: "green",
    padding: height * 0.02,
    borderRadius: width * 0.6,
    alignItems: "center",
    marginTop: height * 0.01,
    width: width * 0.14, // Dynamic width
    borderColor: "#000000FF",
    borderWidth: 1,
  },
  addButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
  removeButton: {
    backgroundColor: "red",
    padding: height * 0.015,
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
    backgroundColor: "#f5f7fa",
    borderRadius: width * 0.02,
    borderColor: "#b0b0b0",
    borderWidth: 1,
    padding: width * 0.025,
    maxWidth: "100%",
  },
  submittedGroupsTitle: {
    fontWeight: "bold",
    fontSize: width * 0.045,
    marginBottom: height * 0.01,
    color: "#1a237e",
  },
  submittedGroupCard: {
    backgroundColor: "#e3eafc",
    borderRadius: width * 0.015,
    padding: width * 0.02,
    marginBottom: height * 0.01,
    borderColor: "#90caf9",
    borderWidth: 1,
  },
  submittedGroupHeader: {
    fontWeight: "bold",
    fontSize: width * 0.038,
    marginBottom: height * 0.005,
    color: "#1976d2",
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
    color: "#333",
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
    backgroundColor: "#fff",
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
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    width: "80%",
    backgroundColor: "white",
    borderRadius: 10,
    padding: 20,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  modalButton: {
    flex: 1,
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
    marginHorizontal: 5,
  },
  modalButtonText: {
    color: "white",
    fontSize: 15,
    fontWeight: "bold",
    textAlign: "center",
  },
});
