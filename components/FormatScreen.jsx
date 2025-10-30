import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
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
import axios from "axios";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { parseFormDesignToQuestions } from "../utils/formDesignParser";
import FormPreviewRenderer from "./FormRenderer/FormPreviewRenderer";
const { width, height } = Dimensions.get("window");

const QUESTIONS_KEY = "offline_questions";
const FORMS_METADATA_KEY = "offline_forms_metadata";
const RELATED_ANSWERS_KEY = "offline_related_answers";
const PENDING_SAVE_RESPONSE_KEY = "pending_save_response";
const PENDING_SAVE_ANSWERS_KEY = "pending_save_answers";
const BACKEND_URL_KEY = "backend_url";

// Agregar esta función DESPUÉS de las importaciones
const uploadFileToServer = async (fileUri, token, backendUrl) => {
  try {
    console.log("📤 Iniciando upload de archivo:", fileUri);
    
    // Obtener información del archivo
    const fileName = fileUri.split('/').pop();
    
    // Crear FormData
    const formData = new FormData();
    
    // Para React Native, necesitamos pasar el archivo de forma diferente
    formData.append('file', {
      uri: fileUri,
      type: 'application/octet-stream', // o detectar el tipo real
      name: fileName,
    });

    // Realizar el upload
    const uploadResponse = await fetch(
      `${backendUrl}/responses/upload-file/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          // NO incluir Content-Type, FormData lo maneja automáticamente
        },
        body: formData,
      }
    );

    if (!uploadResponse.ok) {
      throw new Error(`Error HTTP ${uploadResponse.status}`);
    }

    const uploadResult = await uploadResponse.json();
    console.log("✅ Upload exitoso:", uploadResult);
    
    return uploadResult.file_name; // Retornar el nombre del archivo en el servidor
  } catch (error) {
    console.error("❌ Error en upload:", error);
    throw error;
  }
};
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
  // firm selections per field instance (supports repeaters): key can be `${fieldId}` or `${fieldId}__${rowIndex}`
  const [selectedUserId, setSelectedUserId] = useState(""); // deprecated: kept for backward compatibility
  const [facialUsers, setFacialUsers] = useState([]);
  // form_design rendering state
  const [formItems, setFormItems] = useState([]);
  const [formValues, setFormValues] = useState({});
  const [formErrors, setFormErrors] = useState({});
  
  

  // --- Formatting helpers ---
  const pad2 = (n) => (n < 10 ? `0${n}` : String(n));
  // Now returns YYYY-MM-DD as requested
  const formatDateDDMMYYYY = (value) => {
    if (!value && value !== 0) return "";
    try {
      // Accept YYYY-MM-DD (return as-is)
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
      }
      // Convert DD-MM-YYYY to YYYY-MM-DD
      if (typeof value === "string" && /^\d{2}-\d{2}-\d{4}$/.test(value)) {
        const [D, M, Y] = value.split("-");
        return `${Y}-${M}-${D}`;
      }
      const d = value instanceof Date ? value : new Date(value);
      if (!isNaN(d.getTime()))
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    } catch {}
    return String(value);
  };

  // Now returns HH:MM as requested (accepts HH-MM or HH:MM, normalizes to colon)
  const formatTimeHHmmHyphen = (value) => {
    if (value === undefined || value === null) return "";
    // Accept already formatted HH:MM
    if (typeof value === "string" && /^\d{1,2}:\d{2}$/.test(value)) {
      const [h, m] = value.split(":");
      return `${pad2(Number(h))}:${pad2(Number(m))}`;
    }
    // Accept HH-MM and convert to colon
    if (typeof value === "string" && /^\d{1,2}-\d{2}$/.test(value)) {
      const [h, m] = value.split("-");
      return `${pad2(Number(h))}:${pad2(Number(m))}`;
    }
    try {
      const d = value instanceof Date ? value : new Date(value);
      if (!isNaN(d.getTime()))
        return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    } catch {}
    return String(value);
  };

  // --- Batch Id helper ---
  const createBatchId = () => {
    const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `BATCH-${Date.now()}-${rnd}`;
  };

  // --- Helpers to map form_design item ids to backend question ids ---
  const getExternalQuestionIdFromItem = (it) => {
    if (!it) return null;
    const p = it.props || {};
    const toInt = (v) => {
      if (v === undefined || v === null) return null;
      if (typeof v === "number" && Number.isInteger(v)) return v;
      if (typeof v === "string" && /^\d+$/.test(v)) return parseInt(v, 10);
      return null;
    };
    // Prefer explicit external numeric ids only; avoid falling back to UUIDs
    return (
      toInt(p.question) ||
      toInt(p.question_id) ||
      toInt(p.questionId) ||
      toInt(p.linkExternalId) ||
      toInt(it.linkExternalId) ||
      toInt(p.id) ||
      toInt(it.id) ||
      null
    );
  };

  const findItemById = (items, targetId) => {
    for (const it of items || []) {
      if (!it) continue;
      if (it.id === targetId) return it;
      const t = (it.type || "").toLowerCase();
      if (
        t === "verticallayout" ||
        t === "horizontallayout" ||
        t === "repeater"
      ) {
        const found = findItemById(it.children || [], targetId);
        if (found) return found;
      }
    }
    return null;
  };

  const isRenderableAnswerType = (t) => {
    const s = (t || "").toLowerCase();
    return [
      "input",
      "textarea",
      "number",
      "date",
      "datetime",
      "time",
      "file",
      "select",
      "checkbox",
      "radio",
      "location",
      "firm",
    ].includes(s);
  };

  // --- Helpers: serialize answers from form_design renderer ---
  const isEmptyVal = (v) =>
    v === undefined || v === null || String(v).trim() === "";
const pushAnswer = (buf, questionId, value, type, repeatedId = "") => {
  if (isEmptyVal(value)) return;

  if (type === "file") {
    // 🔑 IMPORTANTE: value ya debería ser el nombre del archivo desde el servidor
    console.log(`📎 Añadiendo archivo a buffer: ${value}`);
    buf.push({
      question_id: questionId,
      question_type: "file",
      answer_text: "",
      file_path: String(value), // Usar el nombre del servidor directamente
      repeated_id: repeatedId,
    });
  } else if (type === "date") {
    const formatted = formatDateDDMMYYYY(value);
    if (!isEmptyVal(formatted)) {
      buf.push({
        question_id: questionId,
        answer_text: formatted,
        file_path: "",
        repeated_id: repeatedId,
      });
    }
  } else if (type === "firm") {
    let parsed = value;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {}
    }
    const fd = parsed?.firmData || parsed || {};
    const filtered = {
      firmData: {
        success: !!fd.success,
        person_id: fd.person_id || fd.personId || "",
        person_name: fd.person_name || fd.personName || fd.name || "",
        qr_url: fd.qr_url || fd.qrUrl || fd.signature_url || "",
      },
    };
    buf.push({
      question_id: questionId,
      answer_text: JSON.stringify(filtered),
      file_path: "",
      repeated_id: repeatedId,
    });
  } else if (type === "time") {
    const hhmm = formatTimeHHmmHyphen(value);
    if (!isEmptyVal(hhmm))
      buf.push({
        question_id: questionId,
        answer_text: hhmm,
        file_path: "",
        repeated_id: repeatedId,
      });
  } else if (type === "checkbox") {
    buf.push({
      question_id: questionId,
      answer_text: value ? "true" : "false",
      file_path: "",
      repeated_id: repeatedId,
    });
  } else {
    buf.push({
      question_id: questionId,
      answer_text: String(value),
      file_path: "",
      repeated_id: repeatedId,
    });
  }
};
  const serializeFormItemsAnswers = (items, values, batchId) => {
    const out = [];
    const walk = (it) => {
      if (!it) return;
      const t = (it.type || "").toLowerCase();
      if (t === "verticallayout" || t === "horizontallayout") {
        (it.children || []).forEach(walk);
        return;
      }
      if (t === "repeater") {
        const rows = values[it.id] || [];
        if (Array.isArray(rows)) {
          rows.forEach((row) => {
            (it.children || []).forEach((child) => {
              const ct = (child.type || "").toLowerCase();
              const val = row[child.id];
              const qid = getExternalQuestionIdFromItem(child);
              if (isRenderableAnswerType(ct)) {
                // Only repeaters carry repeated_id
                pushAnswer(out, qid, val, ct, batchId);
              }
            });
          });
        }
        return;
      }
      // leaf
      const qid = getExternalQuestionIdFromItem(it);
      if (isRenderableAnswerType(t)) {
        // Non-repeated items should not carry repeated_id
        pushAnswer(out, qid, values[it.id], t, "");
      }
    };
    (items || []).forEach(walk);
    return out;
  };

  // Transform a generic form_design tree (web) into mobile renderer items
  const transformFormDesignToItems = (nodeOrArray) => {
    const normalizeType = (t) => (typeof t === "string" ? t : "").trim();
    const mapNode = (node) => {
      if (!node) return null;
      const id =
        node.id ??
        node.itemId ??
        node.key ??
        `${node.type}-${Math.random().toString(36).slice(2, 8)}`;
      const type = normalizeType(node.type);
      const props = node.props || node;
      const childrenRaw = node.children || node.items || node.elements || [];
      const children = Array.isArray(childrenRaw)
        ? childrenRaw.map(mapNode).filter(Boolean)
        : [];
      // Try to preserve any external id hints at both top-level and props
      const linkExternalId =
        node.linkExternalId ??
        node.question_id ??
        node.questionId ??
        node.externalId ??
        node.external_id ??
        node.props?.linkExternalId ??
        node.props?.question_id ??
        node.props?.questionId ??
        null;
      return {
        id,
        type,
        props:
          props && typeof props === "object"
            ? { ...props, ...(linkExternalId ? { linkExternalId } : {}) }
            : linkExternalId
              ? { linkExternalId }
              : {},
        // Also expose on the item in case consumers don't look into props
        ...(linkExternalId ? { linkExternalId } : {}),
        children,
      };
    };
    if (Array.isArray(nodeOrArray))
      return nodeOrArray.map(mapNode).filter(Boolean);
    const mapped = mapNode(nodeOrArray);
    return mapped ? [mapped] : [];
  };

  useEffect(() => {
    const fetchFacialUsers = async () => {
      try {
        // 🆕 Verificar conexión primero
        const netInfo = await NetInfo.fetch();
        if (!netInfo.isConnected) {
          console.log(
            "📵 Sin conexión - Cargando usuarios faciales desde caché offline"
          );

          // Intentar cargar desde caché offline
          try {
            const cached = await AsyncStorage.getItem("cached_facial_users");
            if (cached) {
              const cachedUsers = JSON.parse(cached);
              setFacialUsers(cachedUsers);
              console.log(
                "✅ Usuarios faciales cargados desde caché:",
                cachedUsers.length
              );
              return;
            }
          } catch (e) {
            console.warn("No hay usuarios faciales en caché");
          }

          setFacialUsers([]);
          return;
        }

        const token = await AsyncStorage.getItem("authToken");
        if (!token) {
          console.error("No se encontró el token de autenticación");
          setFacialUsers([]);
          return;
        }

        const backendUrl = await getBackendUrl();
        if (!backendUrl) {
          console.error("No se encontró BACKEND_URL");
          setFacialUsers([]);
          return;
        }

        console.log("🔄 Cargando usuarios faciales desde servidor...");

        const res = await axios.get(
          `${backendUrl}/responses/answers/regisfacial`,
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000, // 🆕 Timeout de 10 segundos
          }
        );

        const mapped = Array.isArray(res.data)
          ? res.data
              .map((item) => {
                try {
                  const parsed = JSON.parse(item.answer_text || "{}");
                  const faceData = parsed.faceData || parsed;
                  if (!faceData) return null;
                  return {
                    id:
                      faceData.person_id ||
                      faceData.personId ||
                      String(Math.random()),
                    name:
                      faceData.personName ||
                      faceData.person_name ||
                      faceData.name ||
                      "Sin nombre",
                    person_id: faceData.person_id || faceData.personId || "",
                    num_document: faceData.person_id || faceData.personId || "", // 🆕 Agregado
                    hash: item.encrypted_hash || item.hash || "",
                  };
                } catch (err) {
                  console.error("Error parseando datos faciales:", err);
                  return null;
                }
              })
              .filter(Boolean)
          : [];

        setFacialUsers(mapped);

        // 🆕 Guardar en caché para uso offline
        if (mapped.length > 0) {
          try {
            await AsyncStorage.setItem(
              "cached_facial_users",
              JSON.stringify(mapped)
            );
            console.log("💾 Usuarios faciales guardados en caché");
          } catch (e) {
            console.warn("No se pudo guardar caché de usuarios faciales");
          }
        }

        console.log("✅ Usuarios faciales cargados:", mapped.length);
      } catch (error) {
        console.error("❌ Error cargando datos faciales:", error.message);

        // 🆕 Intentar cargar desde caché como fallback
        try {
          const cached = await AsyncStorage.getItem("cached_facial_users");
          if (cached) {
            const cachedUsers = JSON.parse(cached);
            setFacialUsers(cachedUsers);
            console.log("✅ Usando caché de usuarios faciales como fallback");
            return;
          }
        } catch (e) {
          console.warn("No se pudo cargar caché de fallback");
        }

        setFacialUsers([]);
      }
    };

    fetchFacialUsers();
  }, []);
  const onOpenSignerSelect = (questionId) => {
    // placeholder: abrir selector de firmantes en siguiente paso
    Alert.alert(
      "Seleccionar firmante",
      `Abrir selector para pregunta ${questionId}`
    );
  };

  const onStartSigning = (questionId) => {
    // placeholder: abrir pantalla de firma en siguiente paso
    Alert.alert(
      "Firmar",
      `Abrir pantalla de firma para pregunta ${questionId}`
    );
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
      // support cached shape either array (legacy) or object { questions, form_design }
      const rawEntry = offlineQuestions[formId];
      let questionsArray = [];
      if (Array.isArray(rawEntry)) questionsArray = rawEntry;
      else if (rawEntry && typeof rawEntry === "object") {
        // Prefer stored parsed questions, but if missing, try to derive from form_design
        if (
          Array.isArray(rawEntry.questions) &&
          rawEntry.questions.length > 0
        ) {
          questionsArray = rawEntry.questions;
        } else if (rawEntry.form_design) {
          try {
            questionsArray = parseFormDesignToQuestions(
              rawEntry.form_design,
              rawEntry.questions || []
            );
          } catch (e) {
            console.warn("Error parsing form_design to questions:", e);
            questionsArray = Array.isArray(rawEntry.questions)
              ? rawEntry.questions
              : [];
          }
        } else {
          questionsArray = Array.isArray(rawEntry.questions)
            ? rawEntry.questions
            : [];
        }
      }

      // If form_design exists, prepare renderer items and initial values
      try {
        if (rawEntry && rawEntry.form_design) {
          const items = transformFormDesignToItems(rawEntry.form_design);
          setFormItems(items);
          // Initialize values only once for fields with default values
          const initial = {};
          const walk = (arr) => {
            arr.forEach((it) => {
              if (it.type === "repeater") {
                initial[it.id] = Array.isArray(initial[it.id])
                  ? initial[it.id]
                  : [];
                if (it.children?.length) {
                  // optional: seed one empty row if required
                }
                walk(it.children || []);
              } else if (it.children && it.children.length) {
                walk(it.children);
              } else {
                if (
                  it.props &&
                  Object.prototype.hasOwnProperty.call(it.props, "value")
                ) {
                  initial[it.id] = it.props.value;
                } else if (typeof it.props?.defaultValue !== "undefined") {
                  initial[it.id] = it.props.defaultValue;
                } else if (it.type === "checkbox") {
                  initial[it.id] = false;
                } else {
                  initial[it.id] = "";
                }
              }
            });
          };
          walk(items);
          setFormValues(initial);
        } else {
          setFormItems([]);
          setFormValues({});
        }
      } catch (e) {
        console.warn(
          "No se pudo transformar form_design para mobile renderer:",
          e
        );
        setFormItems([]);
      }

      // Normalize incoming question_type values to canonical set used by the app
      const normalizeType = (t) => {
        if (!t && t !== 0) return t;
        const s = String(t).toLowerCase();
        if (s === "texto" || s === "text") return "text";
        if (s === "numerico" || s === "number" || s === "numeric")
          return "number";
        if (s === "fecha" || s === "date") return "date";
        if (s === "hora" || s === "time") return "time";
        if (s === "archivo" || s === "file") return "file";
        if (s === "select" || s === "table" || s === "tabla") return "table";
        if (s === "firma" || s === "firm" || s === "signature") return "firm";
        return s;
      };

      const normalizedQuestions = questionsArray.map((q) => {
        try {
          const copy = { ...(q || {}) };
          if (copy.question_type)
            copy.question_type = normalizeType(copy.question_type);
          // normalize options shape to simple strings when possible
          if (Array.isArray(copy.options)) {
            copy.options = copy.options.map((opt) => {
              if (!opt && opt !== 0) return opt;
              if (typeof opt === "string") return opt;
              if (typeof opt === "object")
                return (
                  opt.option_text ||
                  opt.label ||
                  opt.text ||
                  JSON.stringify(opt)
                );
              return String(opt);
            });
          }
          return copy;
        } catch (e) {
          return q;
        }
      });

      setQuestions(normalizedQuestions);
      const storedRelated = await AsyncStorage.getItem(RELATED_ANSWERS_KEY);
      const offlineRelated = storedRelated ? JSON.parse(storedRelated) : {};
      const tableAnswersObj = {};
      const locationRelatedObj = {};
      const correlationsObj = {};
      const relatedQuestionsObj = {};
      normalizedQuestions.forEach((q) => {
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

  const handleFDChange = useCallback(
    (fieldId, value) => {
      // Unificar la captura para que siempre pase por handleAnswerChange
      // (incluye logs ✏️ y guardado offline)
      handleAnswerChange(fieldId, value);
    },
    [handleAnswerChange]
  );

const handleFDFileSelect = useCallback(
  async (fieldId) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result && !result.canceled && result.assets?.[0]?.uri) {
        const uri = result.assets[0].uri;
        console.log("📎 Archivo seleccionado:", uri);

        // 1. Generar serial para el archivo
        const it = findItemById(formItems, fieldId);
        const mappedQuestionId = getExternalQuestionIdFromItem(it) || fieldId;
        await generateSerial(mappedQuestionId);

        // 2. NUEVO: Subir el archivo al servidor
        const token = await AsyncStorage.getItem("authToken");
        const backendUrl = await getBackendUrl();

        if (!token || !backendUrl) {
          Alert.alert("Error", "No hay conexión o token válido");
          return;
        }

        // Mostrar alerta de progreso
        Alert.alert(
          "Cargando archivo",
          "Por favor espera mientras se sube el archivo...",
          [{ text: "OK", onPress: () => {} }]
        );

        try {
          const serverFileName = await uploadFileToServer(uri, token, backendUrl);
          console.log("✅ Archivo subido con nombre:", serverFileName);

          // 3. Guardar el nombre del servidor (no el URI local)
          setFileUris((prev) => ({
            ...prev,
            [fieldId]: serverFileName, // 🔑 IMPORTANTE: guardar el nombre del servidor
          }));

          setFormValues((prev) => ({
            ...prev,
            [fieldId]: serverFileName,
          }));

          handleAnswerChange(fieldId, serverFileName);

          Alert.alert(
            "✅ Éxito",
            `Archivo "${serverFileName}" cargado correctamente`
          );
        } catch (uploadError) {
          console.error("Error uploading file:", uploadError);
          Alert.alert(
            "Error",
            "No se pudo cargar el archivo. Intenta de nuevo."
          );
        }
      }
    } catch (e) {
      console.error("Error selectando archivo:", e);
      Alert.alert("Error", "No se pudo seleccionar el archivo.");
    }
  },
  [formItems, handleAnswerChange]
);

  const handleAnswerChange = useCallback((questionId, value) => {
    console.log(
      `✏️ Capturando respuesta para pregunta ID ${questionId}:`,
      value
    );
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    // Mantener sincronizado el renderer de form_design
    setFormValues((prev) => ({ ...prev, [questionId]: value }));

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
  }, []);

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
      const uri = result.assets[0].uri;
      console.log("📎 Archivo seleccionado (legacy):", uri);

      // Obtener token y URL
      const token = await AsyncStorage.getItem("authToken");
      const backendUrl = await getBackendUrl();

      if (!token || !backendUrl) {
        Alert.alert("Error", "No hay conexión o token válido");
        return;
      }

      // NUEVO: Subir el archivo
      try {
        const serverFileName = await uploadFileToServer(uri, token, backendUrl);
        
        // Guardar el nombre del servidor
        setFileUris((prev) => ({
          ...prev,
          [questionId]: serverFileName,
        }));

        handleAnswerChange(questionId, serverFileName);

        Alert.alert(
          "✅ Éxito",
          `Archivo "${serverFileName}" cargado correctamente`
        );
      } catch (uploadError) {
        console.error("Error uploading file:", uploadError);
        Alert.alert(
          "Error",
          "No se pudo cargar el archivo. Intenta de nuevo."
        );
      }
    } else if (result && result.canceled) {
      // Cancelado por usuario
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

  // --- Repeater helpers: manage sections across repeated questions ---
  const updateAnswersArrayValue = (questionId, index, value) => {
    setAnswers((prev) => {
      const arr = Array.isArray(prev[questionId]) ? [...prev[questionId]] : [];
      arr[index] = value;
      return { ...prev, [questionId]: arr };
    });
  };

  const handleAddSection = (groupId = null) => {
    // Add a section only for questions in the given repeated group (or all if null)
    const groupQ = groupId
      ? isRepeatedQuestions.filter((q) => (q.parentId || "default") === groupId)
      : isRepeatedQuestions;
    setTextAnswers((prev) => {
      const copy = { ...prev };
      groupQ.forEach((q) => {
        if (q.question_type === "text") {
          copy[q.id] = [...(copy[q.id] || []), ""];
        }
      });
      return copy;
    });
    setTableAnswersState((prev) => {
      const copy = { ...prev };
      groupQ.forEach((q) => {
        if (q.question_type === "table") {
          copy[q.id] = [...(copy[q.id] || []), ""];
        }
      });
      return copy;
    });
    setAnswers((prev) => {
      const copy = { ...prev };
      groupQ.forEach((q) => {
        if (q.question_type !== "text" && q.question_type !== "table") {
          const arr = Array.isArray(copy[q.id])
            ? [...copy[q.id]]
            : [copy[q.id] || ""];
          arr.push("");
          copy[q.id] = arr;
        }
      });
      return copy;
    });
  };

  const handleRemoveSection = (groupId = null, index) => {
    const groupQ = groupId
      ? isRepeatedQuestions.filter((q) => (q.parentId || "default") === groupId)
      : isRepeatedQuestions;
    setTextAnswers((prev) => {
      const copy = { ...prev };
      groupQ.forEach((q) => {
        if (q.question_type === "text") {
          copy[q.id] = (copy[q.id] || []).filter((_, i) => i !== index);
        }
      });
      return copy;
    });
    setTableAnswersState((prev) => {
      const copy = { ...prev };
      groupQ.forEach((q) => {
        if (q.question_type === "table") {
          copy[q.id] = (copy[q.id] || []).filter((_, i) => i !== index);
        }
      });
      return copy;
    });
    setAnswers((prev) => {
      const copy = { ...prev };
      groupQ.forEach((q) => {
        if (q.question_type !== "text" && q.question_type !== "table") {
          if (Array.isArray(copy[q.id])) {
            copy[q.id] = copy[q.id].filter((_, i) => i !== index);
          }
        }
      });
      return copy;
    });
  };

  const handleDateChangeForIndex = (questionId, index, selectedDate) => {
    if (selectedDate) {
      const formattedDate = selectedDate.toISOString().split("T")[0];
      setAnswers((prev) => {
        const arr = Array.isArray(prev[questionId])
          ? [...prev[questionId]]
          : [];
        arr[index] = formattedDate;
        return { ...prev, [questionId]: arr };
      });
    }
    setDatePickerVisible((prev) => ({
      ...prev,
      [`${questionId}_${index}`]: false,
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
        const res = await fetch(
          `${backendUrl}/responses/save-answers/?action=send_and_close`,
          {
            method: "POST",
            headers: requestOptions.headers,
            body: JSON.stringify(responseData),
          }
        );

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
    const batchId = createBatchId();
    console.log("🧷 Batch ID:", batchId);
    // Snapshot debug of current state before processing
    try {
      console.log("🧪 Estado actual (resumen):", {
        path: formItems && formItems.length > 0 ? "form_design" : "legacy",
        formValues_keys: Object.keys(formValues || {}),
        answers_keys: Object.keys(answers || {}),
        textAnswers: textAnswers,
        tableAnswersState: tableAnswersState,
      });
      if (formItems && formItems.length > 0) {
        const flatten = [];
        const walk = (it) => {
          if (!it) return;
          const t = (it.type || "").toLowerCase();
          if (t === "verticallayout" || t === "horizontallayout")
            return (it.children || []).forEach(walk);
          if (t === "repeater") return (it.children || []).forEach(walk);
          const extId = getExternalQuestionIdFromItem(it);
          flatten.push({ id: it.id, extId, type: t, value: formValues[it.id] });
        };
        (formItems || []).forEach(walk);
        console.log(
          "🧾 Campos (id:type -> preview)",
          flatten.map((f) => ({
            k: `${f.id}→${f.extId}:${f.type}`,
            v:
              f.type === "file" ? "[file]" : String(f.value ?? "").slice(0, 60),
          }))
        );
      }
    } catch (e) {
      console.warn("No se pudo imprimir snapshot de estado:", e);
    }
    setSubmitting(true);
    // Validate: all table (Select/Table) questions must have at least one selected option
    try {
      const missingTable = questions.some((q) => {
        if (q.question_type !== "table") return false;
        const vals = tableAnswersState[q.id] || [];
        return !vals.some(
          (v) => v !== undefined && v !== null && String(v).trim() !== ""
        );
      });
      if (missingTable) {
        Alert.alert(
          "Error",
          "Por favor selecciona una opción en las preguntas de tipo Tabla antes de continuar."
        );
        setSubmitting(false);
        return;
      }
    } catch (e) {
      // continue if validation fails unexpectedly
      console.warn("Validation check failed:", e);
    }
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");
      const backendUrl = await getBackendUrl();
      let allAnswers = [];
      console.log("📋 Preparando respuestas para cada pregunta...");

      if (formItems && formItems.length > 0) {
        // New path: serialize from form_design items/values
        allAnswers = serializeFormItemsAnswers(formItems, formValues, batchId);
        if (allAnswers.length === 0) {
          // Fallback defensivo: intentar desde `answers` (no cubre repeaters, pero evita quedar en cero)
          const fb = (() => {
            const out = [];
            const keys = Object.keys(answers || {});
            keys.forEach((fieldId) => {
              const it = findItemById(formItems, fieldId);
              if (!it) return;
              const t = (it.type || "").toLowerCase();
              if (!isRenderableAnswerType(t)) return;
              const qid = getExternalQuestionIdFromItem(it);
              const v = answers[fieldId];
              if (Array.isArray(v)) {
                v.forEach((vv) => pushAnswer(out, qid, vv, t, ""));
              } else {
                pushAnswer(out, qid, v, t, "");
              }
            });
            return out;
          })();
          if (fb.length > 0) {
            console.log(
              "🛟 Fallback aplicado: respuestas reconstruidas desde answers:",
              fb.map((a) => ({
                q: a.question_id,
                v: String(a.answer_text).slice(0, 40),
              }))
            );
            allAnswers = fb;
          }
        }
      } else {
        // Legacy path: derive from questions/textAnswers/tableAnswersState/answers
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
                repeated_id: batchId,
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
                repeated_id: batchId,
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
                repeated_id: batchId,
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
              repeated_id: batchId,
            });
          } else if (question.question_type === "file" && answers[questionId]) {
            allAnswers.push({
              question_id: questionId,
              question_type: "file",
              answer_text: "",
              file_path: answers[questionId],
              repeated_id: batchId,
            });
          } else if (question.question_type === "date" && answers[questionId]) {
            const formatted = formatDateDDMMYYYY(answers[questionId]);
            allAnswers.push({
              question_id: questionId,
              answer_text: formatted,
              file_path: "",
              repeated_id: batchId,
            });
          } else if (question.question_type === "time" && answers[questionId]) {
            // Ensure only HH-MM (hyphen)
            const v = formatTimeHHmmHyphen(answers[questionId]);
            allAnswers.push({
              question_id: questionId,
              answer_text: v,
              file_path: "",
              repeated_id: batchId,
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
              repeated_id: batchId,
            });
          } else if (
            question.question_type === "location" &&
            answers[questionId]
          ) {
            allAnswers.push({
              question_id: questionId,
              answer_text: answers[questionId],
              file_path: "",
              repeated_id: batchId,
            });
          } else if (question.question_type === "firm" && answers[questionId]) {
            let parsed = answers[questionId];
            if (typeof parsed === "string") {
              try {
                parsed = JSON.parse(parsed);
              } catch (e) {
                parsed = parsed || {};
              }
            }
            const fd = parsed?.firmData || parsed || {};
            const filteredToSend = {
              firmData: {
                success: !!fd.success,
                person_id: fd.person_id || fd.personId || "",
                person_name: fd.person_name || fd.personName || fd.name || "",
                qr_url: fd.qr_url || fd.qrUrl || fd.signature_url || "",
              },
            };
            allAnswers.push({
              question_id: questionId,
              answer_text: JSON.stringify(filteredToSend),
              file_path: "",
              repeated_id: batchId,
            });
          }
        }
      }

      if (allAnswers.length === 0) {
        console.warn("⚠️ No se encontraron respuestas para enviar. State:", {
          answers,
          formValues,
          textAnswers,
          tableAnswersState,
        });
        Alert.alert("Error", "No hay respuestas para enviar");
        return;
      }

      const mode = await NetInfo.fetch().then((state) =>
        state.isConnected ? "online" : "offline"
      );

      // Prepare API payload for both online/offline
      const allAnswersForApi = allAnswers.map((a) => {
        const base = {
          question_id: a.question_id,
          response: a.file_path ? "" : (a.answer_text ?? ""),
          file_path: a.file_path || "",
        };
        if (a.repeated_id) base.repeated_id = a.repeated_id;
        return base;
      });

      if (mode === "offline") {
        // Unified offline queue entry
        const storedPendingRaw = await AsyncStorage.getItem("pending_forms");
        const pendingQueue = storedPendingRaw
          ? JSON.parse(storedPendingRaw)
          : [];
        pendingQueue.push({
          id,
          answersForApi: allAnswersForApi,
          answersFull: allAnswers,
          fileSerials,
          timestamp: Date.now(),
        });
        await AsyncStorage.setItem(
          "pending_forms",
          JSON.stringify(pendingQueue)
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

      // Debug resumido: question_id -> preview valor
      try {
        console.log(
          "📝 Respuestas a enviar (resumen):",
          allAnswers.map((a) => ({
            q: a.question_id,
            v:
              (a.file_path && "[file]") ||
              String(a.answer_text).slice(0, 60) +
                (String(a.answer_text).length > 60 ? "…" : ""),
          }))
        );
      } catch {}

      // allAnswersForApi already prepared above

      const requestOptions = {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      };

      console.log("📡 Creando registro de respuesta...");
      const saveResponseRes = await fetch(
        `${backendUrl}/responses/save-response/${id}?action=send_and_close`,
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
      const batchId = createBatchId();
      console.log("🧷 Batch ID (progressive):", batchId);
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");
      const backendUrl = await getBackendUrl();
      const mode = await NetInfo.fetch().then((state) =>
        state.isConnected ? "online" : "offline"
      );
      let allToSend = [];
      if (formItems && formItems.length > 0) {
        // form_design path: build answers from renderer items/values just like web
        try {
          let arr = serializeFormItemsAnswers(formItems, formValues, batchId);
          if (!arr || arr.length === 0) {
            // Minimal fallback: reconstruct from current formValues
            const fb = [];
            try {
              Object.entries(formValues || {}).forEach(([k, v]) => {
                if (v === undefined || v === null || String(v).trim() === "")
                  return;
                const it = findItemById(formItems, k);
                if (!it) return;
                const extId = getExternalQuestionIdFromItem(it);
                if (!extId) return;
                const t = (it.type || "").toLowerCase();
                // Non-repeated fallback entries shouldn't carry repeated_id
                pushAnswer(fb, extId, v, t, "");
              });
            } catch {}
            arr = fb;
          }
          allToSend = arr || [];
        } catch (e) {
          console.error(
            "❌ Error serializando respuestas (form_design progressive):",
            e
          );
          allToSend = [];
        }
      } else {
        // Legacy path: build from repeated/non-repeated groups
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
                repeated_id: batchId,
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
                repeated_id: batchId,
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
                repeated_id: batchId,
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
              repeated_id: batchId,
            });
          } else if (question.question_type === "file" && answers[questionId]) {
            repeatedAnswers.push({
              question_id: questionId,
              question_type: "file",
              answer_text: "",
              file_path: "",
              repeated_id: batchId,
            });
          } else if (question.question_type === "date" && answers[questionId]) {
            const formatted = formatDateDDMMYYYY(
              Array.isArray(answers[questionId])
                ? answers[questionId][0]
                : answers[questionId]
            );
            repeatedAnswers.push({
              question_id: questionId,
              answer_text: formatted,
              file_path: "",
              repeated_id: batchId,
            });
          } else if (question.question_type === "time" && answers[questionId]) {
            const formatted = formatTimeHHmmHyphen(
              Array.isArray(answers[questionId])
                ? answers[questionId][0]
                : answers[questionId]
            );
            repeatedAnswers.push({
              question_id: questionId,
              answer_text: formatted,
              file_path: "",
              repeated_id: batchId,
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
              repeated_id: batchId,
            });
          } else if (
            question.question_type === "location" &&
            answers[questionId]
          ) {
            repeatedAnswers.push({
              question_id: questionId,
              answer_text: answers[questionId],
              file_path: "",
              repeated_id: batchId,
            });
          } else if (question.question_type === "firm" && answers[questionId]) {
            repeatedAnswers.push({
              question_id: questionId,
              answer_text: answers[questionId],
              file_path: "",
              repeated_id: batchId,
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
                  repeated_id: batchId,
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
                  repeated_id: batchId,
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
                  repeated_id: batchId,
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
                  repeated_id: batchId,
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
                  repeated_id: batchId,
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
              const formatted = Array.isArray(value)
                ? formatDateDDMMYYYY(value[0])
                : formatDateDDMMYYYY(value);
              if (formatted) {
                nonRepeatedAnswers.push({
                  question_id: questionId,
                  answer_text: formatted,
                  file_path: "",
                  repeated_id: batchId,
                });
              }
            } else if (
              question.question_type === "time" &&
              (nonRepeatedLocked && firstNonRepeatedAnswers[questionId]
                ? firstNonRepeatedAnswers[questionId]
                : answers[questionId])
            ) {
              const value =
                nonRepeatedLocked && firstNonRepeatedAnswers[questionId]
                  ? firstNonRepeatedAnswers[questionId]
                  : answers[questionId];
              const formatted = Array.isArray(value)
                ? formatTimeHHmmHyphen(value[0])
                : formatTimeHHmmHyphen(value);
              if (formatted) {
                nonRepeatedAnswers.push({
                  question_id: questionId,
                  answer_text: formatted,
                  file_path: "",
                  repeated_id: batchId,
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
                  repeated_id: batchId,
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
                  repeated_id: batchId,
                });
              }
            } else if (
              question.question_type === "firm" &&
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
                  repeated_id: batchId,
                });
              }
            }
          }
        }

        allToSend = [...nonRepeatedAnswers, ...repeatedAnswers];
      }

      if (allToSend.length === 0) {
        Alert.alert("Error", "No hay respuestas para enviar");
        setSubmitting(false);
        return;
      }

      if (mode === "offline") {
        // Build API payload like online
        const allAnswersForApi = allToSend.map((a) => {
          const base = {
            question_id: a.question_id,
            response: a.file_path ? "" : (a.answer_text ?? ""),
            file_path: a.file_path || "",
          };
          if (a.repeated_id) base.repeated_id = a.repeated_id;
          return base;
        });

        const storedPendingRaw = await AsyncStorage.getItem("pending_forms");
        const pendingQueue = storedPendingRaw
          ? JSON.parse(storedPendingRaw)
          : [];
        pendingQueue.push({
          id,
          answersForApi: allAnswersForApi,
          answersFull: allToSend,
          fileSerials,
          timestamp: Date.now(),
        });
        await AsyncStorage.setItem(
          "pending_forms",
          JSON.stringify(pendingQueue)
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

      const allAnswersForApi = allToSend.map((a) => {
        const base = {
          question_id: a.question_id,
          response: a.file_path ? "" : (a.answer_text ?? ""),
          file_path: a.file_path || "",
        };
        if (a.repeated_id) base.repeated_id = a.repeated_id;
        return base;
      });

      console.log(
        "📦 save-response payload (progressive, preview):",
        allAnswersForApi.map((r) => ({
          q: r.question_id,
          resp: String(r.response).slice(0, 40),
          file: !!r.file_path,
          rep: r.repeated_id,
        }))
      );

      const saveResponseRes = await fetch(
        `${backendUrl}/responses/save-response/${id}?action=send_and_close`,
        {
          method: "POST",
          headers: requestOptions.headers,
          body: JSON.stringify(allAnswersForApi),
        }
      );
      const saveResponseData = await saveResponseRes.json();
      console.log(
        "📡 save-response status:",
        saveResponseRes.status,
        saveResponseData
      );
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

      Alert.alert("Éxito", "Respuestas enviadas. Puedes seguir agregando más.");
    } catch (error) {
      console.error("❌ Error en el proceso de envío:", error);
      Alert.alert("Error", "No se pudo completar el envío del formulario");
    } finally {
      setSubmitting(false);
    }
  };

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
          {/* form_design driven renderer */}
          {formItems && formItems.length > 0 && (
            <View style={styles.questionsSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIndicator} />
                <Text style={styles.sectionTitle}>Formulario</Text>
              </View>
              <View style={styles.questionsContainer}>
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <Animated.View style={{ transform: [{ rotate: spin }] }}>
                      <SvgXml xml={spinnerSvg} width={50} height={50} />
                    </Animated.View>
                    <Text style={styles.loadingText}>
                      Cargando formulario...
                    </Text>
                  </View>
                ) : (
                  <FormPreviewRenderer
                    formItems={formItems}
                    values={formValues}
                    onChange={handleFDChange}
                    errors={formErrors}
                    onFileSelect={handleFDFileSelect}
                    isSubmitting={submitting}
                    onRequestLocation={handleCaptureLocation}
                    renderFirm={({ item, value, setValue, rowIndex }) => {
                      const key =
                        rowIndex !== undefined && rowIndex !== null
                          ? `${item.id}__${rowIndex}`
                          : item.id;
                      const selected = selectedSigner[key] || "";
                      const user = facialUsers.find((f) => f.id === selected);
                      const userOptions =
                        facialUsers.length > 0
                          ? facialUsers.map((u) => ({
                              id: u.id,
                              name: u.name,
                              num_document:
                                u.person_id ||
                                u.num_document ||
                                "Sin documento",
                            }))
                          : [];
                      return (
                        <FirmField
                          key={`${item.id}-${rowIndex ?? "single"}`}
                          label={item.props?.label || "Firma Digital"}
                          options={userOptions}
                          required={!!item.props?.required}
                          onChange={(ev) => {
                            const val = ev?.target?.value ?? ev ?? "";
                            setSelectedSigner((prev) => ({
                              ...prev,
                              [key]: val,
                            }));
                          }}
                          value={selected}
                          disabled={submitting}
                          error={false}
                          documentHash={String(user?.hash || "")}
                          apiUrl="https://api-signfacial-safe.service.saferut.com"
                          autoCloseDelay={10000}
                          onFirmSuccess={(data) => {
                            console.log(
                              "✅ Firma completada exitosamente:",
                              data
                            );
                          }}
                          onFirmError={(error) => {
                            console.error("❌ Error en la firma:", error);
                          }}
                          onValueChange={(firmCompleteData) => {
                            const fd =
                              firmCompleteData?.firmData ||
                              firmCompleteData?.firm ||
                              {};
                            const filtered = {
                              firmData: {
                                success: !!fd.success,
                                person_id: fd.person_id || fd.personId || "",
                                person_name:
                                  fd.person_name ||
                                  fd.personName ||
                                  fd.name ||
                                  "",
                                qr_url:
                                  fd.qr_url ||
                                  fd.qrUrl ||
                                  fd.signature_url ||
                                  "",
                              },
                            };
                            const serialized = JSON.stringify(filtered);
                            setValue(serialized);
                            handleAnswerChange(item.id, serialized);
                            const preview = filtered.firmData.qr_url || null;
                            if (preview) {
                              setSignatureUris((prev) => ({
                                ...prev,
                                [item.id]: preview,
                              }));
                            }
                          }}
                        />
                      );
                    }}
                  />
                )}
              </View>
            </View>
          )}

          {/* legacy questions path as fallback */}
          {formItems.length === 0 && questions.some((q) => !q.is_repeated) && (
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
                    <Text style={styles.loadingText}>
                      Cargando formulario...
                    </Text>
                  </View>
                ) : (
                  questions
                    .filter((question) => !question.is_repeated)
                    .map((question) =>
                      question.question_type === "firm" ? (
                        <FirmField
                          key={question.id}
                          label={question.question_text || "Firma Digital"}
                          options={
                            facialUsers.length > 0
                              ? facialUsers.map((u) => ({
                                  id: u.id,
                                  name: u.name,
                                  num_document:
                                    u.person_id ||
                                    u.num_document ||
                                    "Sin documento",
                                }))
                              : []
                          } // 🆕 Array vacío si no hay usuarios
                          required={question.required ?? false}
                          onChange={(ev) => {
                            const val = ev?.target?.value ?? ev ?? "";
                            setSelectedSigner((prev) => ({
                              ...prev,
                              [question.id]: val,
                            }));
                          }}
                          value={selectedSigner[question.id] || ""}
                          disabled={submitting}
                          error={false}
                          documentHash={String(
                            facialUsers.find(
                              (f) =>
                                f.id === (selectedSigner[question.id] || "")
                            )?.hash || ""
                          )}
                          apiUrl="https://api-signfacial-safe.service.saferut.com"
                          autoCloseDelay={10000}
                          onFirmSuccess={(data) => {
                            console.log(
                              "✅ Firma completada exitosamente:",
                              data
                            );
                          }}
                          onFirmError={(error) => {
                            console.error("❌ Error en la firma:", error);
                          }}
                          onValueChange={(firmCompleteData) => {
                            console.log(
                              "💾 Guardando datos de firma (raw):",
                              firmCompleteData
                            );

                            // Extraer solo los campos que se deben almacenar/enviar
                            const fd =
                              firmCompleteData?.firmData ||
                              firmCompleteData?.firm ||
                              {};
                            const filtered = {
                              firmData: {
                                success: !!fd.success,
                                person_id: fd.person_id || fd.personId || "",
                                person_name:
                                  fd.person_name ||
                                  fd.personName ||
                                  fd.name ||
                                  "",
                                qr_url:
                                  fd.qr_url ||
                                  fd.qrUrl ||
                                  fd.signature_url ||
                                  "",
                              },
                            };
                            const serialized = JSON.stringify(filtered);
                            // 1) Guardar la respuesta filtrada en el state + offline
                            handleAnswerChange(question.id, serialized);
                            setAnswers((prev) => ({
                              ...prev,
                              [question.id]: serialized,
                            }));

                            // 2) actualizar preview (ui) con la qr_url filtrada
                            const preview = filtered.firmData.qr_url || null;
                            if (preview) {
                              setSignatureUris((prev) => ({
                                ...prev,
                                [question.id]: preview,
                              }));
                            }

                            // DEBUG: verificar estados inmediatamente
                            console.log(
                              "DEBUG Guardado firma filtrada:",
                              filtered,
                              "signatureUris:",
                              preview
                            );
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

          {/* Preguntas Repetidas (secciones) */}
          {formItems.length === 0 && isRepeatedQuestions.length > 0 && (
            <View style={styles.questionsSection}>
              <View style={styles.sectionHeader}>
                <View
                  style={[
                    styles.sectionIndicator,
                    { backgroundColor: "#2D3748" },
                  ]}
                />
                <Text style={styles.sectionTitle}>Información Adicional</Text>
              </View>
              <View style={styles.questionsContainer}>
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <Animated.View style={{ transform: [{ rotate: spin }] }}>
                      <SvgXml xml={spinnerSvg} width={50} height={50} />
                    </Animated.View>
                    <Text style={styles.loadingText}>
                      Cargando formulario...
                    </Text>
                  </View>
                ) : (
                  (() => {
                    // determine how many sections (max length among repeated answers)
                    let sections = 0;
                    isRepeatedQuestions.forEach((q) => {
                      if (q.question_type === "text") {
                        sections = Math.max(
                          sections,
                          (textAnswers[q.id] || []).length
                        );
                      } else if (q.question_type === "table") {
                        sections = Math.max(
                          sections,
                          (tableAnswersState[q.id] || []).length
                        );
                      } else {
                        sections = Math.max(
                          sections,
                          Array.isArray(answers[q.id])
                            ? answers[q.id].length
                            : 0
                        );
                      }
                    });

                    if (sections === 0) sections = 1; // always show at least one section

                    return (
                      <View>
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 10,
                          }}
                        >
                          <Text style={{ fontWeight: "600", color: "#4A5568" }}>
                            Registros: {sections}
                          </Text>
                          <View style={{ flexDirection: "row", gap: 8 }}>
                            <TouchableOpacity
                              style={[
                                styles.addButton,
                                { width: 42, paddingVertical: 8 },
                              ]}
                              onPress={handleAddSection}
                            >
                              <Text style={styles.addButtonText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {Array.from({ length: sections }).map((_, idx) => (
                          <View
                            key={idx}
                            style={{
                              marginBottom: 14,
                              padding: 12,
                              borderRadius: 8,
                              backgroundColor: "#FAFBFC",
                              borderWidth: 1,
                              borderColor: "#E6EEF2",
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                                marginBottom: 8,
                              }}
                            >
                              <Text
                                style={{ fontWeight: "700", color: "#2D3748" }}
                              >
                                Registro #{idx + 1}
                              </Text>
                              <TouchableOpacity
                                onPress={() => handleRemoveSection(idx)}
                                style={styles.clearButton}
                              >
                                <Text style={styles.clearButtonText}>
                                  Eliminar
                                </Text>
                              </TouchableOpacity>
                            </View>

                            {isRepeatedQuestions.map((q) => (
                              <View key={q.id} style={{ marginBottom: 10 }}>
                                <Text
                                  style={{
                                    fontSize: 14,
                                    fontWeight: "600",
                                    color: "#2D3748",
                                    marginBottom: 6,
                                  }}
                                >
                                  {q.question_text}
                                  {q.required && (
                                    <Text style={{ color: "#ef4444" }}> *</Text>
                                  )}
                                </Text>
                                {/* Render per-type input for this section index */}
                                {q.question_type === "text" && (
                                  <>
                                    <TextInput
                                      style={styles.input}
                                      placeholder={
                                        q.placeholder ||
                                        (q.props && q.props.placeholder) ||
                                        "Escribe tu respuesta"
                                      }
                                      value={
                                        (textAnswers[q.id] &&
                                          textAnswers[q.id][idx]) ||
                                        ""
                                      }
                                      onChangeText={(val) =>
                                        handleTextChange(q.id, idx, val)
                                      }
                                    />
                                  </>
                                )}
                                {q.question_type === "table" && (
                                  <>
                                    <View style={styles.pickerSearchWrapper}>
                                      <TextInput
                                        style={styles.pickerSearchInput}
                                        placeholder={
                                          q.placeholder ||
                                          (q.props && q.props.placeholder) ||
                                          "Buscar opción..."
                                        }
                                        value={
                                          pickerSearch[`${q.id}_${idx}`] || ""
                                        }
                                        onChangeText={(text) =>
                                          setPickerSearch((prev) => ({
                                            ...prev,
                                            [`${q.id}_${idx}`]: text,
                                          }))
                                        }
                                      />
                                    </View>
                                    <Picker
                                      selectedValue={
                                        (tableAnswersState[q.id] &&
                                          tableAnswersState[q.id][idx]) ||
                                        ""
                                      }
                                      onValueChange={(val) =>
                                        handleTableSelectChangeWithCorrelation(
                                          q.id,
                                          idx,
                                          val
                                        )
                                      }
                                      mode="dropdown"
                                      style={styles.picker}
                                    >
                                      <Picker.Item
                                        label={
                                          q.placeholder ||
                                          "Selecciona una opción"
                                        }
                                        value=""
                                      />
                                      {Array.isArray(tableAnswers[q.id]) &&
                                        tableAnswers[q.id]
                                          .filter((opt) =>
                                            (pickerSearch[`${q.id}_${idx}`] ||
                                              "") === ""
                                              ? true
                                              : opt
                                                  .toLowerCase()
                                                  .includes(
                                                    (
                                                      pickerSearch[
                                                        `${q.id}_${idx}`
                                                      ] || ""
                                                    ).toLowerCase()
                                                  )
                                          )
                                          .map((opt, i) => (
                                            <Picker.Item
                                              key={i}
                                              label={opt}
                                              value={opt}
                                            />
                                          ))}
                                    </Picker>
                                  </>
                                )}
                                {q.question_type === "number" && (
                                  <TextInput
                                    style={styles.input}
                                    placeholder={
                                      q.placeholder ||
                                      (q.props && q.props.placeholder) ||
                                      "Escribe un número"
                                    }
                                    keyboardType="numeric"
                                    value={
                                      (Array.isArray(answers[q.id]) &&
                                        answers[q.id][idx]) ||
                                      ""
                                    }
                                    onChangeText={(val) =>
                                      updateAnswersArrayValue(q.id, idx, val)
                                    }
                                  />
                                )}
                                {q.question_type === "date" && (
                                  <>
                                    <TouchableOpacity
                                      style={styles.dateButton}
                                      onPress={() =>
                                        setDatePickerVisible((prev) => ({
                                          ...prev,
                                          [`${q.id}_${idx}`]: true,
                                        }))
                                      }
                                    >
                                      <Text style={styles.dateButtonText}>
                                        {(Array.isArray(answers[q.id]) &&
                                          answers[q.id][idx]) ||
                                          q.placeholder ||
                                          "Seleccionar fecha"}
                                      </Text>
                                    </TouchableOpacity>
                                    {datePickerVisible[`${q.id}_${idx}`] && (
                                      <DateTimePicker
                                        value={
                                          answers[q.id] && answers[q.id][idx]
                                            ? new Date(answers[q.id][idx])
                                            : new Date()
                                        }
                                        mode="date"
                                        display="default"
                                        onChange={(e, d) =>
                                          handleDateChangeForIndex(q.id, idx, d)
                                        }
                                      />
                                    )}
                                  </>
                                )}
{q.question_type === "file" && (
  <TouchableOpacity
    style={styles.fileButton}
    onPress={() => {
      (async () => {
        const result = await DocumentPicker.getDocumentAsync({
          type: "*/*",
          copyToCacheDirectory: true,
        });

        if (
          result &&
          !result.canceled &&
          result.assets?.[0]?.uri
        ) {
          const uri = result.assets[0].uri;
          
          // NUEVO: Subir el archivo
          const token = await AsyncStorage.getItem("authToken");
          const backendUrl = await getBackendUrl();

          if (token && backendUrl) {
            try {
              const serverFileName = await uploadFileToServer(
                uri,
                token,
                backendUrl
              );

              setAnswers((prev) => {
                const arr = Array.isArray(prev[q.id])
                  ? [...prev[q.id]]
                  : [];
                arr[idx] = serverFileName; // Guardar nombre del servidor
                return { ...prev, [q.id]: arr };
              });

              Alert.alert(
                "✅ Éxito",
                `Archivo cargado: ${serverFileName}`
              );
            } catch (error) {
              Alert.alert("Error", "No se pudo cargar el archivo");
            }
          }
        }
      })();
    }}
  >
    <Text style={styles.fileButtonText}>
      {Array.isArray(answers[q.id]) &&
      answers[q.id][idx]
        ? "Archivo seleccionado ✓"
        : "Subir archivo"}
    </Text>
  </TouchableOpacity>
)}
                                {q.question_type === "location" && (
                                  <>
                                    <TouchableOpacity
                                      style={[
                                        styles.locationButton,
                                        Array.isArray(answers[q.id]) &&
                                          answers[q.id][idx] && {
                                            backgroundColor: "#22c55e",
                                          },
                                      ]}
                                      onPress={async () => {
                                        try {
                                          let { status } =
                                            await Location.requestForegroundPermissionsAsync();
                                          if (status !== "granted") {
                                            Alert.alert(
                                              "Permiso denegado",
                                              "Se requiere permiso de ubicación."
                                            );
                                            return;
                                          }
                                          let loc =
                                            await Location.getCurrentPositionAsync(
                                              {}
                                            );
                                          const value = `${loc.coords.latitude}, ${loc.coords.longitude}`;
                                          setAnswers((prev) => {
                                            const arr = Array.isArray(
                                              prev[q.id]
                                            )
                                              ? [...prev[q.id]]
                                              : [];
                                            arr[idx] = value;
                                            return { ...prev, [q.id]: arr };
                                          });
                                        } catch (e) {
                                          Alert.alert(
                                            "Error",
                                            "No se pudo obtener la ubicación."
                                          );
                                        }
                                      }}
                                    >
                                      <Text style={styles.locationButtonText}>
                                        {Array.isArray(answers[q.id]) &&
                                        answers[q.id][idx]
                                          ? "Ubicación capturada"
                                          : "Capturar ubicación"}
                                      </Text>
                                    </TouchableOpacity>
                                  </>
                                )}
                                {q.question_type === "firm" && (
                                  <FirmField
                                    label={q.question_text}
                                    options={
                                      facialUsers.length > 0
                                        ? facialUsers.map((u) => ({
                                            id: u.id,
                                            name: u.name,
                                            num_document:
                                              u.person_id ||
                                              u.num_document ||
                                              "Sin documento",
                                          }))
                                        : []
                                    }
                                    required={q.required ?? false}
                                    onChange={(ev) => {
                                      const val = ev?.target?.value ?? ev ?? "";
                                      const key = `${q.id}__${idx}`;
                                      setSelectedSigner((prev) => ({
                                        ...prev,
                                        [key]: val,
                                      }));
                                    }}
                                    value={
                                      selectedSigner[`${q.id}__${idx}`] || ""
                                    }
                                    disabled={submitting}
                                    error={false}
                                    documentHash={String(
                                      facialUsers.find(
                                        (f) =>
                                          f.id ===
                                          (selectedSigner[`${q.id}__${idx}`] ||
                                            "")
                                      )?.hash || ""
                                    )}
                                    apiUrl="https://api-signfacial-safe.service.saferut.com"
                                    autoCloseDelay={10000}
                                    onFirmSuccess={(data) => {
                                      console.log(
                                        "✅ Firma completada exitosamente:",
                                        data
                                      );
                                    }}
                                    onFirmError={(error) => {
                                      console.error(
                                        "❌ Error en la firma:",
                                        error
                                      );
                                    }}
                                    onValueChange={(firmCompleteData) => {
                                      const fd =
                                        firmCompleteData?.firmData ||
                                        firmCompleteData?.firm ||
                                        {};
                                      const filtered = {
                                        firmData: {
                                          success: !!fd.success,
                                          person_id:
                                            fd.person_id || fd.personId || "",
                                          person_name:
                                            fd.person_name ||
                                            fd.personName ||
                                            fd.name ||
                                            "",
                                          qr_url:
                                            fd.qr_url ||
                                            fd.qrUrl ||
                                            fd.signature_url ||
                                            "",
                                        },
                                      };
                                      const serialized =
                                        JSON.stringify(filtered);
                                      setAnswers((prev) => {
                                        const arr = Array.isArray(prev[q.id])
                                          ? [...prev[q.id]]
                                          : [];
                                        arr[idx] = serialized;
                                        return { ...prev, [q.id]: arr };
                                      });
                                    }}
                                  />
                                )}
                              </View>
                            ))}
                          </View>
                        ))}
                      </View>
                    );
                  })()
                )}
              </View>
            </View>
          )}

          {/* Formularios Completados */}
          {formItems.length === 0 &&
            isRepeatedQuestions.length > 1 &&
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
                          <Text style={styles.submittedBadgeText}>
                            #{idx + 1}
                          </Text>
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
                    <Text style={[styles.buttonIcon, { color: "#FFFFFF" }]}>
                      ✓
                    </Text>
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
                    <Text style={[styles.buttonIcon, { color: "#FFFFFF" }]}>
                      ✓
                    </Text>
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
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
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
