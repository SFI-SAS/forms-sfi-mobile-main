import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  BackHandler,
  Dimensions,
  Animated,
  Easing,
  Image,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import NetInfo from "@react-native-community/netinfo";
import { useFocusEffect } from "@react-navigation/native";
import { SvgXml } from "react-native-svg";
import { HomeIcon } from "./Icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import QuestionRenderer from "./FormatRenderer/QuestionRenderer";
import FirmField from "./FirmField";
const { width, height } = Dimensions.get("window");

const QUESTIONS_KEY = "offline_questions";
const FORMS_METADATA_KEY = "offline_forms_metadata";
const RELATED_ANSWERS_KEY = "offline_related_answers";
const PENDING_SAVE_RESPONSE_KEY = "pending_save_response";
const PENDING_SAVE_ANSWERS_KEY = "pending_save_answers";
const BACKEND_URL_KEY = "backend_url";

const spinnerSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle fill="#FFFFFF" stroke="#2C5282" stroke-width="15" r="15" cx="40" cy="65"><animate attributeName="cy" calcMode="spline" dur="1.2" values="65;135;65;" keySplines=".5 0 .5 1;.5 0 .5 1" repeatCount="indefinite" begin="-.4"></animate></circle><circle fill="#FFFFFF" stroke="#2C5282" stroke-width="15" r="15" cx="100" cy="65"><animate attributeName="cy" calcMode="spline" dur="1.2" values="65;135;65;" keySplines=".5 0 .5 1;.5 0 .5 1" repeatCount="indefinite" begin="-.2"></animate></circle><circle fill="#FFFFFF" stroke="#2C5282" stroke-width="15" r="15" cx="160" cy="65"><animate attributeName="cy" calcMode="spline" dur="1.2" values="65;135;65;" keySplines=".5 0 .5 1;.5 0 .5 1" repeatCount="indefinite" begin="0"></animate></circle></svg>
`;

const saveCompletedFormAnswers = async ({
  formId,
  answers,
  questions,
  mode,
}) => {
  try {
    const key = `completed_form_answers_${formId}`;
    const now = new Date();
    const pad = (n) => (n < 10 ? "0" + n : n);
    const submission_date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const submission_time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const questionTextMap = {};
    questions.forEach((q) => {
      questionTextMap[q.id] = q.question_text;
    });
    const stored = await AsyncStorage.getItem(key);
    const arr = stored ? JSON.parse(stored) : [];
    arr.push({
      form_id: formId,
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
    console.error("❌ Error guardando respuestas completadas offline:", e);
  }
};

const getBackendUrl = async () => {
  const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
  return stored || "";
};

export default function FormatScreen(props) {
  const router = useRouter();
  const { id, title, logo_url: logoUrlParam } = useLocalSearchParams();
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [tableAnswers, setTableAnswers] = useState({});
  const [textAnswers, setTextAnswers] = useState({});
  const [tableAnswersState, setTableAnswersState] = useState({});
  const [datePickerVisible, setDatePickerVisible] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [spinAnim] = useState(new Animated.Value(0));
  const [nonRepeatedLocked, setNonRepeatedLocked] = useState(false);
  const [firstNonRepeatedAnswers, setFirstNonRepeatedAnswers] = useState({});
  const [isRepeatedQuestions, setIsRepeatedQuestions] = useState([]);
  const [submittedRepeatedGroups, setSubmittedRepeatedGroups] = useState([]);
  const [pickerSearch, setPickerSearch] = useState({});
  const [fileSerials, setFileSerials] = useState({});
  const [fileUris, setFileUris] = useState({});
  const [formMeta, setFormMeta] = useState({});
  const [locationRelatedAnswers, setLocationRelatedAnswers] = useState({});
  const [locationSelected, setLocationSelected] = useState({});
  const [tableCorrelations, setTableCorrelations] = useState({});
  const [tableRelatedQuestions, setTableRelatedQuestions] = useState({});
  const [tableAutoFilled, setTableAutoFilled] = useState({});
  const [locationError, setLocationError] = useState({});
  const [signatureUris, setSignatureUris] = useState({});
  const [selectedSigner, setSelectedSigner] = useState({});
  const [selectedUserId, setSelectedUserId] = useState("");
const onOpenSignerSelect = (questionId) => {
    // placeholder: abrir selector de firmantes en siguiente paso
    Alert.alert("Seleccionar firmante", `Abrir selector para pregunta ${questionId}`);
  };

  const onStartSigning = (questionId) => {
    // placeholder: abrir pantalla de firma en siguiente paso
    Alert.alert("Firmar", `Abrir pantalla de firma para pregunta ${questionId}`);
  };

  const onClearSignature = (questionId) => {
    setSignatureUris((prev) => {
      const copy = { ...prev };
      delete copy[questionId];
      return copy;
    });
    setSelectedSigner((prev) => {
      const copy = { ...prev };
      delete copy[questionId];
      return copy;
    });
  };
  
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

  const loadAllOfflineData = async (formId) => {
    try {
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

  const handleFileButtonPress = async (questionId) => {
    await generateSerial(questionId);
    await handleFileUploadWithSerial(questionId);
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
        // Cancelado por el usuario
      } else {
        Alert.alert("Error", "No se pudo seleccionar el archivo.");
      }
    } catch (error) {
      Alert.alert("Error", "No se pudo seleccionar el archivo.");
    }
  };

  const generateSerial = async (questionId) => {
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
          return;
        }
        serial = data && data.serial;
        if (!serial) {
          console.error("❌ Serial no recibido del backend. Respuesta:", data);
          Alert.alert(
            "Error",
            "No se pudo generar el serial. Intenta de nuevo."
          );
          return;
        }
        console.log("🟢 Serial generado ONLINE:", serial);
      } else {
        serial = "OFF-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
        console.log("🟠 Serial generado OFFLINE:", serial);
      }
      setFileSerials((prev) => ({ ...prev, [questionId]: serial }));
    } catch (e) {
      console.error("❌ Error generando serial:", e);
      Alert.alert("Error", "No se pudo generar el serial.");
    }
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

  const handleTableSelectChangeWithCorrelation = (questionId, index, value) => {
    console.log("[DEBUG] Selección en tabla:", { questionId, index, value });
    setTableAnswersState((prev) => {
      const updatedAnswers = [...(prev[questionId] || [])];
      updatedAnswers[index] = value;
      console.log("[DEBUG] Estado tras selección principal:", {
        ...prev,
        [questionId]: updatedAnswers,
      });
      return { ...prev, [questionId]: updatedAnswers };
    });

    const correlation = tableCorrelations[questionId]?.[value];
    console.log("[DEBUG] Correlación directa encontrada:", correlation);

    if (correlation) {
      Object.entries(correlation).forEach(([relatedQId, relatedValue]) => {
        Object.entries(tableAnswers).forEach(([otherQId, options]) => {
          if (otherQId !== questionId && Array.isArray(options)) {
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
    }

    Object.entries(tableCorrelations).forEach(([otherQId, corrObj]) => {
      if (otherQId !== questionId) {
        Object.entries(corrObj).forEach(([corrValue, rels]) => {
          if (rels && rels[questionId] && rels[questionId] === value) {
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
                    return { ...prev, [targetQId]: arr };
                  });
                }
              }
            });
          }
        });
      }
    });

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

  const handleAddTableAnswer = (questionId) => {
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
      const formattedDate = selectedDate.toISOString().split("T")[0];
      setAnswers((prev) => ({ ...prev, [questionId]: formattedDate }));
    }
    setDatePickerVisible((prev) => ({ ...prev, [questionId]: false }));
  };

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

  useEffect(() => {
    if (questions.length > 0) {
      const repeated = questions.filter((q) => q.is_repeated);
      setIsRepeatedQuestions(repeated);
    }
  }, [questions]);

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
      const allAnswers = [];
      console.log("📋 Preparando respuestas para cada pregunta...");

      for (const question of questions) {
        const questionId = question.id;

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
        } else if (
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
        } else if (
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
        } else if (
          question.question_type === "one_choice" &&
          answers[questionId]
        ) {
          allAnswers.push({
            question_id: questionId,
            answer_text: answers[questionId],
            file_path: "",
          });
        } else if (question.question_type === "file" && answers[questionId]) {
          allAnswers.push({
            question_id: questionId,
            question_type: "file",
            answer_text: "",
            file_path: answers[questionId],
          });
        } else if (question.question_type === "date" && answers[questionId]) {
          allAnswers.push({
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
          allAnswers.push({
            question_id: questionId,
            answer_text: value,
            file_path: "",
          });
        } else if (
          question.question_type === "location" &&
          answers[questionId]
        ) {
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
        const saveResponseData = {
          form_id: id,
          answers: allAnswers.map((a) => ({
            question_id: a.question_id,
            response: "",
            file_path: a.file_path || "",
            repeated_id: "",
          })),
          mode: "offline",
          timestamp: Date.now(),
        };

        const saveAnswersData = allAnswers.map((a) => ({
          form_id: id,
          question_id: a.question_id,
          answer_text: a.answer_text,
          file_path: a.file_path || "",
          timestamp: Date.now(),
        }));

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

      console.log("📝 Respuestas a enviar:", allAnswers);

      const allAnswersForApi = allAnswers.map((a) => ({
        question_id: a.question_id,
        response: "",
        file_path: a.file_path || "",
        repeated_id: "",
      }));

      const requestOptions = {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      };

      console.log("📡 Creando registro de respuesta...");
      const saveResponseRes = await fetch(
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

      console.log("📤 Enviando respuestas de forma secuencial...");
      const results = await sendAnswers(allAnswers, responseId, requestOptions);

      const hasErrors = results.some((result) => result.error);
      if (hasErrors) {
        throw new Error("Algunas respuestas no pudieron ser guardadas");
      }

      await saveCompletedFormAnswers({
        formId: id,
        answers: allAnswers,
        questions,
        mode: "online",
      });

      Alert.alert("Éxito", "Formulario enviado correctamente");
      router.back();
    } catch (error) {
      console.error("❌ Error en el proceso de envío:", error);
      Alert.alert("Error", "No se pudo completar el envío del formulario");
    } finally {
      setSubmitting(false);
    }
  };

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

  const clearRepeatedAnswers = () => {
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

  const handleProgressiveSubmit = async () => {
    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");
      const backendUrl = await getBackendUrl();
      const mode = await NetInfo.fetch().then((state) =>
        state.isConnected ? "online" : "offline"
      );

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
            answer_text: "",
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

      const allToSend = [...nonRepeatedAnswers, ...repeatedAnswers];

      if (allToSend.length === 0) {
        Alert.alert("Error", "No hay respuestas para enviar");
        setSubmitting(false);
        return;
      }

      if (mode === "offline") {
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
        await saveCompletedFormAnswers({
          formId: id,
          answers: allToSend,
          questions,
          mode: "offline",
        });

        if (!nonRepeatedLocked) lockNonRepeatedAnswers();
        clearRepeatedAnswers();

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

      const requestOptions = {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      };

      const allAnswersForApi = allToSend.map((a) => ({
        question_id: a.question_id,
        response: "",
        file_path: a.file_path || "",
        repeated_id: "",
      }));

      const saveResponseRes = await fetch(
        `${backendUrl}/responses/save-response/${id}?mode=${mode}&action=send_and_close`,
        {
          method: "POST",
          headers: requestOptions.headers,
          body: JSON.stringify(allAnswersForApi),
        }
      );
      const saveResponseData = await saveResponseRes.json();
      const responseId = saveResponseData.response_id;
      if (!responseId) throw new Error("No se pudo obtener el ID de respuesta");

      await sendAnswers(allToSend, responseId, requestOptions);

      await saveCompletedFormAnswers({
        formId: id,
        answers: allToSend,
        questions,
        mode,
      });

      if (!nonRepeatedLocked) lockNonRepeatedAnswers();
      clearRepeatedAnswers();

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
        "Éxito",
        "Respuestas enviadas. Puedes seguir agregando más."
      );
    } catch (error) {
      console.error("❌ Error en el proceso de envío:", error);
      Alert.alert("Error", "No se pudo completar el envío del formulario");
    } finally {
      setSubmitting(false);
    }
  };

  console.log(questions)
  return (
    <View style={styles.mainContainer}>
      <LinearGradient
        colors={["#F8F9FA", "#FFFFFF"]}
        style={styles.gradientBackground}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          stickyHeaderIndices={[0]}
        >
          {/* Header Empresarial */}
          <View style={styles.stickyHeader}>
            <View style={styles.headerContent}>
              {(logoUrlParam || formMeta.logo_url) && (
                <View style={styles.logoContainer}>
                  <Image
                    source={{ uri: logoUrlParam || formMeta.logo_url }}
                    style={styles.formLogo}
                    resizeMode="contain"
                  />
                </View>
              )}
              <View style={styles.headerTextContainer}>
                <Text style={styles.header}>
                  {title ? title.toUpperCase() : ""}
                </Text>
                <View style={styles.idBadge}>
                  <Text style={styles.idBadgeText}>ID: 00{id}</Text>
                </View>
              </View>
            </View>
          </View>
          {/* Preguntas No Repetidas */}
          {questions.some((q) => !q.is_repeated) && (
            <View style={styles.questionsSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIndicator} />
                <Text style={styles.sectionTitle}>Información General</Text>
              </View>
              <View style={styles.questionsContainer}>
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <Animated.View style={{ transform: [{ rotate: spin }] }}>
                      <SvgXml xml={spinnerSvg} width={50} height={50} />
                    </Animated.View>
                    <Text style={styles.loadingText}>Cargando formulario...</Text>
                  </View>
                ) : (
                  questions
                    .filter((question) => !question.is_repeated)
                    .map((question) =>
                      question.question_type === "firm" ? (
  <FirmField
        key="firma_digital_001"
        label="Firma Digital del Documento"
        options={[
          {
            id: "usr_001",
            name: "Juan Pérez García",
            num_document: "1098765432"
          },
          {
            id: "usr_002",
            name: "María González López",
            num_document: "1087654321"
          },
          {
            id: "usr_003",
            name: "Carlos Rodríguez Méndez",
            num_document: "1076543210"
          },
          {
            id: "usr_004",
            name: "Ana Martínez Sánchez",
            num_document: "1065432109"
          }
        ]}
        required={true}
  onChange={(e) => {
          console.log('📝 Usuario seleccionado:', e.target.value);
          setSelectedUserId(e.target.value); // ⭐ ACTUALIZAR ESTADO
        }}
        value={selectedUserId}  // Cambia esto al ID del usuario seleccionado: "usr_001", "usr_002", etc.
        disabled={false}
        error={false}
        documentHash="a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6"
        apiUrl="https://api-signfacial-safe.service.saferut.com"
        autoCloseDelay={10000}
        onFirmSuccess={(data) => {
          console.log('✅ Firma completada exitosamente:', data);
          console.log('Person ID:', data.firmData.person_id);
          console.log('Person Name:', data.firmData.person_name);
          console.log('QR URL:', data.firmData.qr_url);
        }}
        onFirmError={(error) => {
          console.error('❌ Error en la firma:', error);
        }}
        onValueChange={(firmCompleteData) => {
          console.log('💾 Guardando datos de firma:', firmCompleteData);
          // Aquí guardas los datos completos en tu formulario
          // firmCompleteData contiene:
          // {
          //   firmData: {
          //     success: true,
          //     person_id: "usr_001",
          //     person_name: "Juan Pérez García",
          //     qr_url: "https://..."
          //   }
          // }
        }}
      />
                      ) : (
                        <QuestionRenderer
                          key={question.id}
                          question={question}
                          isLocked={nonRepeatedLocked}
                          answers={answers}
                          textAnswers={textAnswers}
                          tableAnswersState={tableAnswersState}
                          tableAnswers={tableAnswers}
                          datePickerVisible={datePickerVisible}
                          fileSerials={fileSerials}
                          fileUris={fileUris}
                          pickerSearch={pickerSearch}
                          tableAutoFilled={tableAutoFilled}
                          locationError={locationError}
                          locationRelatedAnswers={locationRelatedAnswers}
                          locationSelected={locationSelected}
                          allowAddRemove={false}
                          setAnswers={setAnswers}
                          handleTextChange={handleTextChange}
                          handleRemoveTextField={handleRemoveTextField}
                          handleAddTextField={handleAddTextField}
                          handleTableSelectChangeWithCorrelation={
                            handleTableSelectChangeWithCorrelation
                          }
                          setPickerSearch={setPickerSearch}
                          setDatePickerVisible={setDatePickerVisible}
                          handleDateChange={handleDateChange}
                          handleFileButtonPress={handleFileButtonPress}
                          handleCaptureLocation={handleCaptureLocation}
                          setLocationSelected={setLocationSelected}
                          handleAddTableAnswer={handleAddTableAnswer}
                          handleRemoveTableAnswer={handleRemoveTableAnswer}
                        />
                      )
                    )
                 )}
              </View>
            </View>
          )}

          {/* Preguntas Repetidas */}
          {isRepeatedQuestions.length > 0 && (
            <View style={styles.questionsSection}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIndicator, { backgroundColor: "#2D3748" }]} />
                <Text style={styles.sectionTitle}>Información Adicional</Text>
              </View>
              <View style={styles.questionsContainer}>
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <Animated.View style={{ transform: [{ rotate: spin }] }}>
                      <SvgXml xml={spinnerSvg} width={50} height={50} />
                    </Animated.View>
                    <Text style={styles.loadingText}>Cargando formulario...</Text>
                  </View>
                ) : (
                  isRepeatedQuestions.map((question) => (
                    <QuestionRenderer
                      key={question.id}
                      question={question}
                      isLocked={false}
                      answers={answers}
                      textAnswers={textAnswers}
                      tableAnswersState={tableAnswersState}
                      tableAnswers={tableAnswers}
                      datePickerVisible={datePickerVisible}
                      fileSerials={fileSerials}
                      fileUris={fileUris}
                      pickerSearch={pickerSearch}
                      tableAutoFilled={tableAutoFilled}
                      locationError={locationError}
                      locationRelatedAnswers={locationRelatedAnswers}
                      locationSelected={locationSelected}
                      allowAddRemove={isRepeatedQuestions.length === 1}
                      setAnswers={setAnswers}
                      handleTextChange={handleTextChange}
                      handleRemoveTextField={handleRemoveTextField}
                      handleAddTextField={handleAddTextField}
                      handleTableSelectChangeWithCorrelation={
                        handleTableSelectChangeWithCorrelation
                      }
                      setPickerSearch={setPickerSearch}
                      setDatePickerVisible={setDatePickerVisible}
                      handleDateChange={handleDateChange}
                      handleFileButtonPress={handleFileButtonPress}
                      handleCaptureLocation={handleCaptureLocation}
                      setLocationSelected={setLocationSelected}
                      handleAddTableAnswer={handleAddTableAnswer}
                      handleRemoveTableAnswer={handleRemoveTableAnswer}
                    />
                  ))
                )}
              </View>
            </View>
          )}

          {/* Formularios Completados */}
          {isRepeatedQuestions.length > 1 &&
            submittedRepeatedGroups.length > 0 && (
              <View style={styles.submittedSection}>
                <View style={styles.submittedHeader}>
                  <Text style={styles.submittedIcon}>✓</Text>
                  <Text style={styles.submittedTitle}>
                    Formularios Completados ({submittedRepeatedGroups.length})
                  </Text>
                </View>
                <ScrollView
                  style={styles.submittedScrollView}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  {submittedRepeatedGroups.map((group, idx) => (
                    <View key={idx} style={styles.submittedCard}>
                      <View style={styles.submittedCardHeader}>
                        <View style={styles.submittedBadge}>
                          <Text style={styles.submittedBadgeText}>#{idx + 1}</Text>
                        </View>
                        <Text style={styles.submittedCardTitle}>
                          Registro {idx + 1}
                        </Text>
                      </View>
                      {isRepeatedQuestions.map((q) => (
                        <View key={q.id} style={styles.submittedRow}>
                          <Text style={styles.submittedLabel}>
                            {q.question_text}
                          </Text>
                          <View style={styles.submittedValueContainer}>
                            {Array.isArray(group[q.id])
                              ? group[q.id]
                                .filter((ans) => ans && ans !== "")
                                .map((ans, i) => (
                                  <Text
                                    key={i}
                                    style={styles.submittedValue}
                                    numberOfLines={2}
                                    ellipsizeMode="tail"
                                  >
                                    {ans}
                                  </Text>
                                ))
                              : group[q.id] && (
                                <Text
                                  style={styles.submittedValue}
                                  numberOfLines={2}
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
            )}

          {/* Botones de Acción */}
          {/* Botones de Acción */}
          <View style={styles.actionsContainer}>
            {/* Botón Cancelar (Volver al Inicio) */}
            <TouchableOpacity
              style={[styles.actionButton, styles.homeButton]}
              onPress={() => router.push("/home")}
              disabled={submitting}
              activeOpacity={0.7}
            >
              <View style={styles.buttonContent}>
                <Text style={styles.buttonTextHome}>Cancelar</Text>
              </View>
            </TouchableOpacity>

            {/* Botón Principal */}
            {isRepeatedQuestions.length > 1 ? (
              <TouchableOpacity
                style={[styles.actionButton, styles.primaryButton]}
                onPress={submitting ? null : handleProgressiveSubmit}
                disabled={submitting}
                activeOpacity={0.7}
              >
                {submitting ? (
                  <View style={styles.buttonContent}>
                    <Animated.View style={{ transform: [{ rotate: spin }] }}>
                      <SvgXml xml={spinnerSvg} width={20} height={20} />
                    </Animated.View>
                    <Text style={styles.buttonTextPrimary}>Enviando...</Text>
                  </View>
                ) : (
                  <View style={styles.buttonContent}>
                    <Text style={[styles.buttonIcon, { color: "#FFFFFF" }]}>✓</Text>
                    <Text style={styles.buttonTextPrimary}>Enviar</Text>
                  </View>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.actionButton, styles.primaryButton]}
                onPress={submitting ? null : handleSubmitForm}
                disabled={submitting}
                activeOpacity={0.7}
              >
                {submitting ? (
                  <View style={styles.buttonContent}>
                    <Animated.View style={{ transform: [{ rotate: spin }] }}>
                      <SvgXml xml={spinnerSvg} width={20} height={20} />
                    </Animated.View>
                    <Text style={styles.buttonTextPrimary}>Enviando...</Text>
                  </View>
                ) : (
                  <View style={styles.buttonContent}>
                    <Text style={[styles.buttonIcon, { color: "#FFFFFF" }]}>✓</Text>
                    <Text style={styles.buttonTextPrimary}>Enviar</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  gradientBackground: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: height * 0.03,
  },

  // Header Empresarial
  stickyHeader: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 100,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoContainer: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "#F7FAFC",
    borderWidth: 2,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    marginRight: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  formLogo: {
    width: "100%",
    height: "100%",
  },
  headerTextContainer: {
    flex: 1,
  },
  header: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A202C",
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  idBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#EDF2F7",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  idBadgeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4A5568",
    letterSpacing: 0.5,
  },


  instructionIconContainer: {
    marginRight: 14,
  },
  instructionIcon: {
    fontSize: 28,
  },
  instructionTextContainer: {
    flex: 1,
  },
  instructionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2D3748",
    marginBottom: 4,
  },
  instructionText: {
    fontSize: 13,
    color: "#718096",
    lineHeight: 20,
  },

  // Secciones de Preguntas
  questionsSection: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionIndicator: {
    width: 4,
    height: 20,
    backgroundColor: "#0F8593",
    borderRadius: 2,
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2D3748",
    letterSpacing: 0.3,
  },
  questionsContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    color: "#718096",
    marginTop: 16,
    fontWeight: "500",
  },

  // Formularios Completados
  submittedSection: {
    marginTop: 24,
    marginHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  submittedHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  submittedIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  submittedTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2D3748",
    letterSpacing: 0.3,
  },
  submittedScrollView: {
    maxHeight: height * 0.35,
  },
  submittedCard: {
    backgroundColor: "#F7FAFC",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  submittedCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  submittedBadge: {
    backgroundColor: "#0F8593",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 10,
  },
  submittedBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  submittedCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2D3748",
  },
  submittedRow: {
    marginBottom: 10,
  },
  submittedLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4A5568",
    marginBottom: 4,
  },
  submittedValueContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  submittedValue: {
    fontSize: 13,
    color: "#2D3748",
    marginBottom: 2,
  },

  // Botones de Acción
  // Botones de Acción
  actionsContainer: {
    marginTop: 28,
    paddingHorizontal: 20,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    minHeight: 45,
  },
  primaryButton: {
    backgroundColor: "#0F8390", // Azul como en la imagen
  },
  secondaryButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
  },
  homeButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonIcon: {
    fontSize: 20,
  },
  buttonTextPrimary: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  buttonTextSecondary: {
    color: "#475569",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  buttonTextHome: {
    color: "#475569",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  signatureContainer: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#F7FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  signatureLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2D3748",
    marginBottom: 8,
  },
  signatureRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  signerSelect: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginRight: 8,
    justifyContent: "center",
  },
  signerText: {
    fontSize: 14,
    color: "#2D3748",
  },
  signButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: "#0F8593",
    justifyContent: "center",
  },
  signButtonText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "700",
    textAlign: "center",
  },
  signaturePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  signatureImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginRight: 12,
  },
  signaturePlaceholder: {
    flex: 1,
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#EDF2F7",
  },
  placeholderText: {
    fontSize: 14,
    color: "#A0AEC0",
  },
  clearButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#F56565",
    justifyContent: "center",
  },
  clearButtonText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "700",
    textAlign: "center",
  },
  hintText: {
    fontSize: 12,
    color: "#718096",
    marginTop: 8,
    textAlign: "center",
  },
});