import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useReducer,
} from "react";
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
  InteractionManager,
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
    const fileName = fileUri.split("/").pop();

    // Crear FormData
    const formData = new FormData();

    // Para React Native, necesitamos pasar el archivo de forma diferente
    formData.append("file", {
      uri: fileUri,
      type: "application/octet-stream", // o detectar el tipo real
      name: fileName,
    });

    // Realizar el upload
    const uploadResponse = await fetch(`${backendUrl}/responses/upload-file/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        // NO incluir Content-Type, FormData lo maneja automáticamente
      },
      body: formData,
    });

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

// Skeleton Loading Components - Optimized with React.memo and cleanup
const SkeletonQuestion = React.memo(() => {
  const pulseAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();

    // Cleanup animation on unmount to prevent memory leaks
    return () => {
      animation.stop();
      pulseAnim.setValue(0);
    };
  }, [pulseAnim]);

  const opacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <View style={skeletonStyles.questionContainer}>
      <Animated.View style={[skeletonStyles.labelSkeleton, { opacity }]} />
      <Animated.View style={[skeletonStyles.inputSkeleton, { opacity }]} />
    </View>
  );
});

const SkeletonTable = React.memo(() => {
  const pulseAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();

    // Cleanup animation on unmount to prevent memory leaks
    return () => {
      animation.stop();
      pulseAnim.setValue(0);
    };
  }, [pulseAnim]);

  const opacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <View style={skeletonStyles.tableContainer}>
      <Animated.View
        style={[skeletonStyles.tableHeaderSkeleton, { opacity }]}
      />
      <Animated.View style={[skeletonStyles.tableRowSkeleton, { opacity }]} />
      <Animated.View style={[skeletonStyles.tableRowSkeleton, { opacity }]} />
    </View>
  );
});

const SkeletonForm = () => (
  <View style={skeletonStyles.formContainer}>
    <SkeletonQuestion />
    <SkeletonQuestion />
    <SkeletonQuestion />
    <SkeletonTable />
    <SkeletonQuestion />
    <SkeletonQuestion />
    <SkeletonQuestion />
    <SkeletonQuestion />
    <SkeletonTable />
    <SkeletonQuestion />
    <SkeletonQuestion />
    <SkeletonQuestion />
    <SkeletonQuestion />
    <SkeletonQuestion />
    <SkeletonTable />
    <SkeletonQuestion />
    <SkeletonQuestion />
    <SkeletonQuestion />
  </View>
);

// ✅ FIX: Memoizar componente de pregunta repetida para evitar re-renders
const RepeatedQuestionItem = React.memo(
  ({
    question,
    idx,
    textAnswers,
    tableAnswersState,
    pickerSearch,
    tableAnswers,
    onTextChange,
    onTableChange,
    onPickerSearchChange,
    onAddAnswer,
    onRemoveAnswer,
  }) => {
    return (
      <View key={question.id} style={{ marginBottom: 10 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: "#2D3748",
            marginBottom: 6,
          }}
        >
          {question.question_text}
          {question.required && <Text style={{ color: "#ef4444" }}> *</Text>}
        </Text>
        {/* Contenido de la pregunta - se renderizará según el tipo */}
      </View>
    );
  },
  (prevProps, nextProps) => {
    // ✅ Comparación personalizada para evitar re-renders innecesarios
    return (
      prevProps.idx === nextProps.idx &&
      prevProps.textAnswers[prevProps.question.id]?.[prevProps.idx] ===
        nextProps.textAnswers[nextProps.question.id]?.[nextProps.idx] &&
      prevProps.tableAnswersState[prevProps.question.id]?.[prevProps.idx] ===
        nextProps.tableAnswersState[nextProps.question.id]?.[nextProps.idx] &&
      prevProps.pickerSearch[`${prevProps.question.id}_${prevProps.idx}`] ===
        nextProps.pickerSearch[`${nextProps.question.id}_${nextProps.idx}`]
    );
  }
);

const skeletonStyles = StyleSheet.create({
  formContainer: {
    padding: 16,
  },
  questionContainer: {
    marginBottom: 20,
  },
  labelSkeleton: {
    width: "60%",
    height: 16,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    marginBottom: 8,
  },
  inputSkeleton: {
    width: "100%",
    height: 48,
    backgroundColor: "#e0e0e0",
    borderRadius: 8,
  },
  tableContainer: {
    marginBottom: 20,
  },
  tableHeaderSkeleton: {
    width: "100%",
    height: 40,
    backgroundColor: "#e0e0e0",
    borderRadius: 8,
    marginBottom: 8,
  },
  tableRowSkeleton: {
    width: "100%",
    height: 60,
    backgroundColor: "#e0e0e0",
    borderRadius: 8,
    marginBottom: 6,
  },
});

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

// ✅ OPTIMIZACIÓN: Reducer para consolidar 32 estados en 1 solo
const initialState = {
  questions: [],
  answers: {},
  loading: true,
  tableAnswers: {},
  textAnswers: {},
  tableAnswersState: {},
  datePickerVisible: {},
  submitting: false,
  nonRepeatedLocked: false,
  firstNonRepeatedAnswers: {},
  isRepeatedQuestions: [],
  submittedRepeatedGroups: [],
  pickerSearch: {},
  fileSerials: {},
  fileUris: {},
  formMeta: {},
  locationRelatedAnswers: {},
  locationSelected: {},
  tableCorrelations: {},
  tableRelatedQuestions: {},
  tableAutoFilled: {},
  locationError: {},
  signatureUris: {},
  selectedSigner: {},
  selectedUserId: "",
  facialUsers: [],
  formItems: [],
  formValues: {},
  formErrors: {},
};

function formReducer(state, action) {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };

    case "SET_FIELD_FUNC":
      // ✅ Soporte para funciones (prev => newValue)
      return {
        ...state,
        [action.field]: action.updater(state[action.field]),
      };

    case "UPDATE_FIELD":
      return {
        ...state,
        [action.field]: { ...state[action.field], ...action.value },
      };

    case "MERGE_FIELDS":
      return { ...state, ...action.payload };

    case "RESET_ALL":
      return { ...initialState, loading: false };

    default:
      return state;
  }
}

export default function FormatScreen(props) {
  console.log("HOLA");
  const router = useRouter();
  const { id, title, logo_url: logoUrlParam } = useLocalSearchParams();

  // ✅ OPTIMIZACIÓN: Un solo useReducer en lugar de 32 useState
  const [state, dispatch] = useReducer(formReducer, initialState);

  // ✅ Helpers para acceder al estado (mejor legibilidad)
  const setField = useCallback((field, value) => {
    dispatch({ type: "SET_FIELD", field, value });
  }, []);

  const updateField = useCallback((field, value) => {
    dispatch({ type: "UPDATE_FIELD", field, value });
  }, []);

  const mergeFields = useCallback((payload) => {
    dispatch({ type: "MERGE_FIELDS", payload });
  }, []);

  const resetAll = useCallback(() => {
    dispatch({ type: "RESET_ALL" });
  }, []);

  // ✅ OPTIMIZACIÓN: Aliases para compatibilidad (evita reescribir todo el código)
  const questions = state.questions;
  const answers = state.answers;
  const loading = state.loading;
  const tableAnswers = state.tableAnswers;
  const textAnswers = state.textAnswers;
  const tableAnswersState = state.tableAnswersState;
  const datePickerVisible = state.datePickerVisible;
  const submitting = state.submitting;
  const nonRepeatedLocked = state.nonRepeatedLocked;
  const firstNonRepeatedAnswers = state.firstNonRepeatedAnswers;
  const isRepeatedQuestions = state.isRepeatedQuestions;
  const submittedRepeatedGroups = state.submittedRepeatedGroups;
  const pickerSearch = state.pickerSearch;
  const fileSerials = state.fileSerials;
  const fileUris = state.fileUris;
  const formMeta = state.formMeta;
  const locationRelatedAnswers = state.locationRelatedAnswers;
  const locationSelected = state.locationSelected;
  const tableCorrelations = state.tableCorrelations;
  const tableRelatedQuestions = state.tableRelatedQuestions;
  const tableAutoFilled = state.tableAutoFilled;
  const locationError = state.locationError;
  const signatureUris = state.signatureUris;
  const selectedSigner = state.selectedSigner;
  const selectedUserId = state.selectedUserId;
  const facialUsers = state.facialUsers;
  const formItems = state.formItems;
  const formValues = state.formValues;
  const formErrors = state.formErrors;

  // ✅ OPTIMIZACIÓN: Setters que usan el reducer (1 re-render en lugar de 32)
  const setQuestions = useCallback(
    (val) => dispatch({ type: "SET_FIELD", field: "questions", value: val }),
    []
  );
  const setAnswers = useCallback((val) => {
    if (typeof val === "function") {
      dispatch({ type: "SET_FIELD_FUNC", field: "answers", updater: val });
    } else {
      dispatch({ type: "SET_FIELD", field: "answers", value: val });
    }
  }, []); // ✅ Sin dependencias = sin re-renders infinitos
  const setLoading = useCallback(
    (val) => dispatch({ type: "SET_FIELD", field: "loading", value: val }),
    []
  );
  const setTableAnswers = useCallback(
    (val) => dispatch({ type: "SET_FIELD", field: "tableAnswers", value: val }),
    []
  );
  const setTextAnswers = useCallback(
    (val) => dispatch({ type: "SET_FIELD", field: "textAnswers", value: val }),
    []
  );
  const setTableAnswersState = useCallback(
    (val) =>
      dispatch({ type: "SET_FIELD", field: "tableAnswersState", value: val }),
    []
  );
  const setDatePickerVisible = useCallback(
    (val) =>
      dispatch({ type: "SET_FIELD", field: "datePickerVisible", value: val }),
    []
  );
  const setSubmitting = useCallback(
    (val) => dispatch({ type: "SET_FIELD", field: "submitting", value: val }),
    []
  );
  const setNonRepeatedLocked = useCallback(
    (val) =>
      dispatch({ type: "SET_FIELD", field: "nonRepeatedLocked", value: val }),
    []
  );
  const setFirstNonRepeatedAnswers = useCallback(
    (val) =>
      dispatch({
        type: "SET_FIELD",
        field: "firstNonRepeatedAnswers",
        value: val,
      }),
    []
  );
  const setIsRepeatedQuestions = useCallback(
    (val) =>
      dispatch({ type: "SET_FIELD", field: "isRepeatedQuestions", value: val }),
    []
  );
  const setSubmittedRepeatedGroups = useCallback(
    (val) =>
      dispatch({
        type: "SET_FIELD",
        field: "submittedRepeatedGroups",
        value: val,
      }),
    []
  );
  const setPickerSearch = useCallback(
    (val) => dispatch({ type: "SET_FIELD", field: "pickerSearch", value: val }),
    []
  );
  const setFileSerials = useCallback(
    (val) => dispatch({ type: "SET_FIELD", field: "fileSerials", value: val }),
    []
  );
  const setFileUris = useCallback(
    (val) => dispatch({ type: "SET_FIELD", field: "fileUris", value: val }),
    []
  );
  const setFormMeta = useCallback((val) => {
    if (typeof val === "function") {
      dispatch({ type: "SET_FIELD_FUNC", field: "formMeta", updater: val });
    } else {
      dispatch({ type: "SET_FIELD", field: "formMeta", value: val });
    }
  }, []); // ✅ Sin dependencias
  const setLocationRelatedAnswers = useCallback(
    (val) =>
      dispatch({
        type: "SET_FIELD",
        field: "locationRelatedAnswers",
        value: val,
      }),
    []
  );
  const setLocationSelected = useCallback(
    (val) =>
      dispatch({ type: "SET_FIELD", field: "locationSelected", value: val }),
    []
  );
  const setTableCorrelations = useCallback(
    (val) =>
      dispatch({ type: "SET_FIELD", field: "tableCorrelations", value: val }),
    []
  );
  const setTableRelatedQuestions = useCallback(
    (val) =>
      dispatch({
        type: "SET_FIELD",
        field: "tableRelatedQuestions",
        value: val,
      }),
    []
  );
  const setTableAutoFilled = useCallback(
    (val) =>
      dispatch({ type: "SET_FIELD", field: "tableAutoFilled", value: val }),
    []
  );
  const setLocationError = useCallback(
    (val) =>
      dispatch({ type: "SET_FIELD", field: "locationError", value: val }),
    []
  );
  const setSignatureUris = useCallback((val) => {
    if (typeof val === "function") {
      dispatch({
        type: "SET_FIELD_FUNC",
        field: "signatureUris",
        updater: val,
      });
    } else {
      dispatch({ type: "SET_FIELD", field: "signatureUris", value: val });
    }
  }, []);
  const setSelectedSigner = useCallback((val) => {
    if (typeof val === "function") {
      dispatch({
        type: "SET_FIELD_FUNC",
        field: "selectedSigner",
        updater: val,
      });
    } else {
      dispatch({ type: "SET_FIELD", field: "selectedSigner", value: val });
    }
  }, []);
  const setSelectedUserId = useCallback(
    (val) =>
      dispatch({ type: "SET_FIELD", field: "selectedUserId", value: val }),
    []
  );
  const setFacialUsers = useCallback(
    (val) => dispatch({ type: "SET_FIELD", field: "facialUsers", value: val }),
    []
  );
  const setFormItems = useCallback(
    (val) => dispatch({ type: "SET_FIELD", field: "formItems", value: val }),
    []
  );
  const setFormValues = useCallback((val) => {
    if (typeof val === "function") {
      dispatch({ type: "SET_FIELD_FUNC", field: "formValues", updater: val });
    } else {
      dispatch({ type: "SET_FIELD", field: "formValues", value: val });
    }
  }, []);
  const setFormErrors = useCallback(
    (val) => dispatch({ type: "SET_FIELD", field: "formErrors", value: val }),
    []
  );

  // ✅ FIX: Animated.Value debe ser useRef, no useState (evita re-renders)
  const spinAnim = React.useRef(new Animated.Value(0)).current;

  // ✅ FIX: useRef para cancelar requests pendientes al desmontar
  const isMountedRef = React.useRef(true);

  const getBackendUrl = async () => {
    const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
    return stored || "";
  };

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
          qr_code: fd.qr_code || fd.qrCode || fd.qr || "",
          qr_link: fd.qr_link || fd.qrLink || "",
          validation_id: fd.validation_id || fd.validationId || "",
          confidence_score: fd.confidence_score || fd.confidenceScore || 0,
          liveness_score: fd.liveness_score || fd.livenessScore || 0,
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
      // ✅ FIX: Verificar si el componente está montado antes de continuar
      if (!isMountedRef.current) return;

      try {
        // ✅ OPTIMIZACIÓN: Cargar PRIMERO desde caché (instantáneo)
        try {
          const cached = await AsyncStorage.getItem("cached_facial_users");
          if (cached && isMountedRef.current) {
            const cachedUsers = JSON.parse(cached);
            setFacialUsers(cachedUsers);
            console.log(
              "⚡ Usuarios faciales cargados desde caché (instantáneo):",
              cachedUsers.length
            );

            // ✅ Verificar si el caché es reciente (menos de 1 hora)
            const cacheTimestamp = await AsyncStorage.getItem(
              "cached_facial_users_timestamp"
            );
            if (cacheTimestamp) {
              const age = Date.now() - parseInt(cacheTimestamp, 10);
              const oneHour = 60 * 60 * 1000;

              if (age < oneHour) {
                console.log(
                  "✅ Caché aún válido, no se requiere actualización"
                );
                return; // Caché reciente, no actualizar
              }
            }
          }
        } catch (e) {
          console.warn("No se pudo cargar caché inicial");
        }

        // ✅ Verificar que aún esté montado antes de hacer request
        if (!isMountedRef.current) return;

        // ✅ Verificar conexión antes de actualizar
        const netInfo = await NetInfo.fetch();
        if (!netInfo.isConnected) {
          console.log("📵 Sin conexión - Usando solo caché");
          return;
        }

        const token = await AsyncStorage.getItem("authToken");
        if (!token) {
          console.log("⚠️ No hay token - Usando solo caché");
          return;
        }

        const backendUrl = await getBackendUrl();
        if (!backendUrl) {
          console.log("⚠️ No hay backend URL - Usando solo caché");
          return;
        }

        // ✅ Verificar nuevamente antes del request
        if (!isMountedRef.current) return;

        // ✅ Actualizar en segundo plano (solo si hay conexión)
        console.log("🔄 Actualizando usuarios faciales en segundo plano...");

        const res = await axios.get(
          `${backendUrl}/responses/answers/regisfacial`,
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000,
          }
        );

        // ✅ Solo actualizar estado si el componente sigue montado
        if (!isMountedRef.current) {
          console.log("⚠️ Componente desmontado, cancelando actualización");
          return;
        }

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
                    num_document: faceData.person_id || faceData.personId || "",
                    hash: item.encrypted_hash || item.hash || "",
                  };
                } catch (err) {
                  console.error("Error parseando datos faciales:", err);
                  return null;
                }
              })
              .filter(Boolean)
          : [];

        // ✅ Solo actualizar si hay cambios Y el componente está montado
        if (mapped.length > 0 && isMountedRef.current) {
          setFacialUsers(mapped);

          try {
            await AsyncStorage.setItem(
              "cached_facial_users",
              JSON.stringify(mapped)
            );
            await AsyncStorage.setItem(
              "cached_facial_users_timestamp",
              String(Date.now())
            );
            console.log("💾 Caché actualizado con", mapped.length, "usuarios");
          } catch (e) {
            console.warn("No se pudo actualizar caché");
          }
        }
      } catch (error) {
        console.error("❌ Error cargando datos faciales:", error.message);

        // 🆕 Intentar cargar desde caché como fallback
        try {
          const cached = await AsyncStorage.getItem("cached_facial_users");
          if (cached && isMountedRef.current) {
            const cachedUsers = JSON.parse(cached);
            setFacialUsers(cachedUsers);
            console.log("✅ Usando caché de usuarios faciales como fallback");
            return;
          }
        } catch (e) {
          console.warn("No se pudo cargar caché de fallback");
        }

        if (isMountedRef.current) {
          setFacialUsers([]);
        }
      }
    };

    fetchFacialUsers();
  }, []);

  // ✅ FIX CRÍTICO: Cleanup cuando el componente se desmonta
  useEffect(() => {
    // Marcar componente como montado
    isMountedRef.current = true;

    return () => {
      // ✅ FIX: NO poner forceCleanup en dependencias - ejecutar directamente
      console.log("🧹 FORZANDO LIMPIEZA DE MEMORIA...");

      try {
        // Marcar como desmontado
        isMountedRef.current = false;

        // Detener todas las animaciones
        spinAnim.stopAnimation();
        spinAnim.setValue(0);

        // ✅ Usar InteractionManager para dar prioridad al garbage collector
        InteractionManager.runAfterInteractions(() => {
          // ✅ OPTIMIZACIÓN: Resetear todo el estado con un solo dispatch
          dispatch({ type: "RESET_ALL" });

          // Resetear ref del formulario cargado
          loadedFormIdRef.current = null;

          console.log(
            "✅ Limpieza forzada completada - Estado reseteado con useReducer"
          );
        });
      } catch (error) {
        console.error("❌ Error en limpieza forzada:", error);
      }
    };
  }, []); // ✅ Sin dependencias - solo ejecutar en mount/unmount

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

  // ✅ FIX CRÍTICO: Función de limpieza forzada para liberar memoria
  const forceCleanup = useCallback(() => {
    console.log("🧹 FORZANDO LIMPIEZA DE MEMORIA...");

    try {
      // Marcar como desmontado
      isMountedRef.current = false;

      // Detener todas las animaciones
      spinAnim.stopAnimation();
      spinAnim.setValue(0);

      // ✅ Usar InteractionManager para dar prioridad al garbage collector
      InteractionManager.runAfterInteractions(() => {
        // ✅ OPTIMIZACIÓN: Resetear todo el estado con un solo dispatch
        resetAll();

        // Resetear ref del formulario cargado
        loadedFormIdRef.current = null;

        console.log(
          "✅ Limpieza forzada completada - Estado reseteado con useReducer"
        );
      });
    } catch (error) {
      console.error("❌ Error en limpieza forzada:", error);
    }
  }, [resetAll]);

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
      // Show UI immediately, skeleton will display while loading
      setLoading(true);

      const storedQuestions = await AsyncStorage.getItem(QUESTIONS_KEY);

      // ✅ FIX: Proteger JSON.parse con try-catch
      let offlineQuestions = {};
      try {
        offlineQuestions = storedQuestions ? JSON.parse(storedQuestions) : {};
      } catch (parseError) {
        console.error("❌ Error parseando storedQuestions:", parseError);
        offlineQuestions = {};
      }

      // ✅ SIMPLIFICADO: Si no hay datos en cache, mostrar mensaje claro
      if (!offlineQuestions[formId]) {
        console.warn(`⚠️ No hay datos en cache para formulario ${formId}`);
        if (isMountedRef.current) {
          Alert.alert(
            "Datos no disponibles",
            "Los datos del formulario no están disponibles. Por favor, regrese a la pantalla principal y toque el botón Refresh para cargar los datos.",
            [{ text: "OK", onPress: () => setLoading(false) }]
          );
        }
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

      // VALIDACIÓN CRÍTICA: Asegurar que tenemos preguntas válidas
      if (!questionsArray || questionsArray.length === 0) {
        console.warn(
          `⚠️ No se encontraron preguntas válidas para formulario ${formId}, intentando fetch directo`
        );
        const success = await fetchFormDataDirectly(formId);
        if (success) {
          return loadAllOfflineData(formId); // Retry after fetch
        }
        // Crear pregunta de fallback para evitar pantalla vacía
        questionsArray = [
          {
            id: `fallback_${formId}`,
            question_text:
              "Error: No se pudieron cargar las preguntas del formulario",
            question_type: "text",
            is_required: false,
          },
        ];
      }

      // If form_design exists, prepare renderer items and initial values
      try {
        if (rawEntry && rawEntry.form_design) {
          const items = transformFormDesignToItems(rawEntry.form_design);
          // ✅ NO hacer setState aquí - se hará después con MERGE_FIELDS
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

          // ✅ OPTIMIZACIÓN: Agrupar setState de formItems + formValues en 1 dispatch
          dispatch({
            type: "MERGE_FIELDS",
            payload: {
              formItems: items,
              formValues: initial,
            },
          });
        } else {
          dispatch({
            type: "MERGE_FIELDS",
            payload: {
              formItems: [],
              formValues: {},
            },
          });
        }
      } catch (e) {
        console.warn(
          "No se pudo transformar form_design para mobile renderer:",
          e
        );
        dispatch({
          type: "MERGE_FIELDS",
          payload: {
            formItems: [],
            formValues: {},
          },
        });
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

      // ✅ FIX: Verificar que el componente siga montado antes de procesar grandes arrays
      if (!isMountedRef.current) return;

      // ✅ FIX: Limitar procesamiento de arrays grandes (protección contra OOM)
      const MAX_QUESTIONS = 500; // Límite de seguridad
      if (questionsArray.length > MAX_QUESTIONS) {
        console.warn(
          `⚠️ Formulario con ${questionsArray.length} preguntas excede el límite de ${MAX_QUESTIONS}`
        );
        questionsArray = questionsArray.slice(0, MAX_QUESTIONS);
      }

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

      // ✅ FIX: Proteger JSON.parse con try-catch
      let offlineRelated = {};
      try {
        offlineRelated = storedRelated ? JSON.parse(storedRelated) : {};
      } catch (parseError) {
        console.error("❌ Error parseando storedRelated:", parseError);
        offlineRelated = {};
      }

      const tableAnswersObj = {};
      const locationRelatedObj = {};
      const correlationsObj = {};
      const relatedQuestionsObj = {};

      // ✅ FIX: Validar que normalizedQuestions sea un array antes de forEach
      if (!Array.isArray(normalizedQuestions)) {
        console.error(
          "❌ normalizedQuestions no es un array:",
          typeof normalizedQuestions
        );
        if (isMountedRef.current) {
          setLoading(false);
        }
        return;
      }

      normalizedQuestions.forEach((q) => {
        // ✅ FIX: Proteger contra objetos null/undefined
        if (!q || typeof q !== "object") {
          console.warn("⚠️ Pregunta inválida encontrada:", q);
          return;
        }

        if (q.question_type === "table") {
          const rel = offlineRelated[q.id];
          if (rel && Array.isArray(rel.data)) {
            tableAnswersObj[q.id] = rel.data
              .map((item) => {
                if (typeof item === "object" && item?.name) return item.name;
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

      // ✅ OPTIMIZACIÓN CRÍTICA: Agrupar TODOS los setState en 1 solo dispatch
      // Esto reduce de ~8 re-renders a solo 1
      dispatch({
        type: "MERGE_FIELDS",
        payload: {
          tableAnswers: tableAnswersObj,
          locationRelatedAnswers: locationRelatedObj,
          tableCorrelations: correlationsObj,
          tableRelatedQuestions: relatedQuestionsObj,
        },
      });

      // ✅ FIX: Verificar si el componente sigue montado antes de actualizar loading
      if (!isMountedRef.current) return;

      // Ensure skeleton is visible for at least 300ms for better UX
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      console.error("❌ Error cargando datos offline:", error);
      if (isMountedRef.current) {
        Alert.alert("Error", "No se pudieron cargar los datos offline.");
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // ✅ FIX: useRef para evitar recargas múltiples del mismo formulario
  const loadedFormIdRef = React.useRef(null);

  useEffect(() => {
    // ✅ Evitar recargar si es el mismo formulario
    if (id && id !== loadedFormIdRef.current && isMountedRef.current) {
      loadedFormIdRef.current = id;
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
          // ✅ FIX: Proteger JSON.parse con try-catch
          try {
            const metaObj = JSON.parse(storedMeta);
            if (metaObj && metaObj[id] && isMountedRef.current) {
              setFormMeta(metaObj[id]);
            }
          } catch (parseError) {
            console.error("❌ Error parseando metaObj:", parseError);
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
          const size = result.assets[0].size || 0;

          // ✅ FIX: Límite de 50MB para evitar OutOfMemory
          const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
          if (size > MAX_FILE_SIZE) {
            Alert.alert(
              "Archivo demasiado grande",
              `El archivo seleccionado (${(size / 1024 / 1024).toFixed(2)} MB) excede el límite de 50 MB.`
            );
            return;
          }

          console.log(
            "📎 Archivo seleccionado:",
            uri,
            `(${(size / 1024 / 1024).toFixed(2)} MB)`
          );

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
            const serverFileName = await uploadFileToServer(
              uri,
              token,
              backendUrl
            );
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
          const serverFileName = await uploadFileToServer(
            uri,
            token,
            backendUrl
          );

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

  const handleTextChange = useCallback((questionId, index, value) => {
    console.log(
      `✏️ Actualizando respuesta ${index + 1} para pregunta ID ${questionId}:`,
      value
    );
    setTextAnswers((prev) => {
      const updatedAnswers = [...(prev[questionId] || [])];
      updatedAnswers[index] = value;
      return { ...prev, [questionId]: updatedAnswers };
    });
  }, []);

  const handleAddTextField = useCallback((questionId) => {
    console.log(`➕ Agregando nuevo campo para pregunta ID ${questionId}`);
    setTextAnswers((prev) => ({
      ...prev,
      [questionId]: [...(prev[questionId] || []), ""],
    }));
  }, []);

  const handleRemoveTextField = useCallback((questionId, index) => {
    setTextAnswers((prev) => ({
      ...prev,
      [questionId]: prev[questionId].filter((_, i) => i !== index),
    }));
  }, []);

  const handleTableSelectChangeWithCorrelation = useCallback(
    (questionId, index, value) => {
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
    },
    [tableCorrelations, tableAnswers]
  );

  const handleAddTableAnswer = useCallback((questionId) => {
    setTableAnswersState((prev) => ({
      ...prev,
      [questionId]: [...(prev[questionId] || []), ""],
    }));
  }, []);

  const handleRemoveTableAnswer = useCallback((questionId, index) => {
    setTableAnswersState((prev) => ({
      ...prev,
      [questionId]: prev[questionId].filter((_, i) => i !== index),
    }));
  }, []);

  // --- Repeater helpers: manage sections across repeated questions ---
  const updateAnswersArrayValue = useCallback((questionId, index, value) => {
    setAnswers((prev) => {
      const arr = Array.isArray(prev[questionId]) ? [...prev[questionId]] : [];
      arr[index] = value;
      return { ...prev, [questionId]: arr };
    });
  }, []);

  const handleAddSection = useCallback(
    (groupId = null) => {
      // Add a section only for questions in the given repeated group (or all if null)
      const groupQ = groupId
        ? isRepeatedQuestions.filter(
            (q) => (q.parentId || "default") === groupId
          )
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
    },
    [isRepeatedQuestions]
  );

  const handleRemoveSection = useCallback(
    (groupId = null, index) => {
      const groupQ = groupId
        ? isRepeatedQuestions.filter(
            (q) => (q.parentId || "default") === groupId
          )
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
    },
    [isRepeatedQuestions]
  );

  const handleDateChangeForIndex = useCallback(
    (questionId, index, selectedDate) => {
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
    },
    []
  );

  const handleDateChange = useCallback((questionId, selectedDate) => {
    if (selectedDate) {
      const formattedDate = selectedDate.toISOString().split("T")[0];
      setAnswers((prev) => ({ ...prev, [questionId]: formattedDate }));
    }
    setDatePickerVisible((prev) => ({ ...prev, [questionId]: false }));
  }, []);

  const handleCaptureLocation = useCallback(
    async (questionId) => {
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
    },
    [handleAnswerChange]
  );

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

    // ✅ OPTIMIZACIÓN: Agrupar ambos setState en uno con MERGE_FIELDS
    dispatch({
      type: "MERGE_FIELDS",
      payload: {
        textAnswers: initialTextAnswers,
        tableAnswersState: initialTableAnswers,
      },
    });
  }, [questions]);

  useEffect(() => {
    let animation;
    if (submitting) {
      animation = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      animation.start();
    } else {
      spinAnim.stopAnimation();
      spinAnim.setValue(0);
    }

    // Cleanup animation on unmount to prevent memory leaks
    return () => {
      if (animation) {
        animation.stop();
      }
      spinAnim.stopAnimation();
      spinAnim.setValue(0);
    };
  }, [submitting, spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // Memoize repeated questions filter to avoid recalculation on every render
  const repeatedQuestions = useMemo(() => {
    return questions.filter((q) => q.is_repeated);
  }, [questions]);

  useEffect(() => {
    if (repeatedQuestions.length > 0) {
      setIsRepeatedQuestions(repeatedQuestions);
    }
  }, [repeatedQuestions]);

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
                qr_code: fd.qr_code || fd.qrCode || fd.qr || "",
                qr_link: fd.qr_link || fd.qrLink || "",
                validation_id: fd.validation_id || fd.validationId || "",
                confidence_score:
                  fd.confidence_score || fd.confidenceScore || 0,
                liveness_score: fd.liveness_score || fd.livenessScore || 0,
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

        // ✅ FIX: Forzar limpieza antes de salir
        forceCleanup();

        // ✅ Dar más tiempo para que se complete la limpieza (300ms)
        setTimeout(() => {
          router.back();
        }, 300);
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

      // ✅ FIX: Forzar limpieza antes de salir
      forceCleanup();

      // ✅ Dar más tiempo para que se complete la limpieza (300ms)
      setTimeout(() => {
        router.back();
      }, 300);
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

  // Memoize derived values to avoid recalculation on every render
  const logoUrl = useMemo(() => {
    return logoUrlParam || formMeta.logo_url;
  }, [logoUrlParam, formMeta.logo_url]);

  const formattedTitle = useMemo(() => {
    return title ? title.toUpperCase() : "";
  }, [title]);

  const formIdDisplay = useMemo(() => {
    return `ID: 00${id}`;
  }, [id]);

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
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          initialNumToRender={10}
          windowSize={21}
        >
          {/* Header Empresarial */}
          <View style={styles.stickyHeader}>
            <View style={styles.headerContent}>
              {logoUrl && (
                <View style={styles.logoContainer}>
                  <Image
                    source={{ uri: logoUrl }}
                    style={styles.formLogo}
                    resizeMode="contain"
                  />
                </View>
              )}
              <View style={styles.headerTextContainer}>
                <Text style={styles.header}>{formattedTitle}</Text>
                <View style={styles.idBadge}>
                  <Text style={styles.idBadgeText}>{formIdDisplay}</Text>
                </View>
              </View>
            </View>
          </View>
          {/* Preguntas No Repetidas */}
          {/* form_design driven renderer */}
          {(loading || (formItems && formItems.length > 0)) && (
            <View style={styles.questionsSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIndicator} />
                <Text style={styles.sectionTitle}>Formulario</Text>
              </View>
              <View style={styles.questionsContainer}>
                {loading ? (
                  <SkeletonForm />
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
                          apiUrl="https://api-facialsafe.service.saferut.com"
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
                                qr_code: fd.qr_code || fd.qrCode || fd.qr || "",
                                qr_link: fd.qr_link || fd.qrLink || "",
                                validation_id:
                                  fd.validation_id || fd.validationId || "",
                                confidence_score:
                                  fd.confidence_score ||
                                  fd.confidenceScore ||
                                  0,
                                liveness_score:
                                  fd.liveness_score || fd.livenessScore || 0,
                              },
                            };
                            const serialized = JSON.stringify(filtered);
                            setValue(serialized);
                            handleAnswerChange(item.id, serialized);
                            const preview =
                              filtered.firmData.qr_url ||
                              filtered.firmData.qr_link ||
                              filtered.firmData.qr_code ||
                              null;
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
          {(loading ||
            (formItems.length === 0 &&
              questions.some((q) => !q.is_repeated))) && (
            <View style={styles.questionsSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIndicator} />
                <Text style={styles.sectionTitle}>Información General</Text>
              </View>
              <View style={styles.questionsContainer}>
                {loading ? (
                  <SkeletonForm />
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
                          apiUrl="https://api-facialsafe.service.saferut.com"
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
                                qr_code: fd.qr_code || fd.qrCode || fd.qr || "",
                                qr_link: fd.qr_link || fd.qrLink || "",
                                validation_id:
                                  fd.validation_id || fd.validationId || "",
                                confidence_score:
                                  fd.confidence_score ||
                                  fd.confidenceScore ||
                                  0,
                                liveness_score:
                                  fd.liveness_score || fd.livenessScore || 0,
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
                            const preview =
                              filtered.firmData.qr_url ||
                              filtered.firmData.qr_link ||
                              filtered.firmData.qr_code ||
                              null;
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
          {(loading ||
            (formItems.length === 0 && isRepeatedQuestions.length > 0)) && (
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
                  <SkeletonForm />
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
                                      placeholderTextColor="#4B5563"
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
                                        placeholderTextColor="#4B5563"
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
                                        tableAnswersState[q.id]?.[idx] || ""
                                      }
                                      onValueChange={(val) => {
                                        if (val !== "") {
                                          handleTableSelectChangeWithCorrelation(
                                            q.id,
                                            idx,
                                            val
                                          );
                                        }
                                      }}
                                      mode="dropdown"
                                      style={styles.picker}
                                    >
                                      <Picker.Item
                                        label={
                                          q.placeholder ||
                                          "Selecciona una opción"
                                        }
                                        value=""
                                        enabled={false}
                                      />
                                      {Array.isArray(tableAnswers[q.id]) &&
                                        tableAnswers[q.id]
                                          .filter((opt) => {
                                            const searchTerm =
                                              pickerSearch[`${q.id}_${idx}`] ||
                                              "";
                                            return (
                                              searchTerm === "" ||
                                              opt
                                                ?.toLowerCase?.()
                                                .includes(
                                                  searchTerm.toLowerCase()
                                                )
                                            );
                                          })
                                          .map((opt) => (
                                            <Picker.Item
                                              key={`${q.id}-${idx}-${opt}`}
                                              label={String(opt)}
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
                                    placeholderTextColor="#4B5563"
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
                                        const result =
                                          await DocumentPicker.getDocumentAsync(
                                            {
                                              type: "*/*",
                                              copyToCacheDirectory: true,
                                            }
                                          );

                                        if (
                                          result &&
                                          !result.canceled &&
                                          result.assets?.[0]?.uri
                                        ) {
                                          const uri = result.assets[0].uri;

                                          // NUEVO: Subir el archivo
                                          const token =
                                            await AsyncStorage.getItem(
                                              "authToken"
                                            );
                                          const backendUrl =
                                            await getBackendUrl();

                                          if (token && backendUrl) {
                                            try {
                                              const serverFileName =
                                                await uploadFileToServer(
                                                  uri,
                                                  token,
                                                  backendUrl
                                                );

                                              setAnswers((prev) => {
                                                const arr = Array.isArray(
                                                  prev[q.id]
                                                )
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
                                              Alert.alert(
                                                "Error",
                                                "No se pudo cargar el archivo"
                                              );
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
                                    apiUrl="https://api-facialsafe.service.saferut.com"
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
                                          qr_code:
                                            fd.qr_code ||
                                            fd.qrCode ||
                                            fd.qr ||
                                            "",
                                          qr_link:
                                            fd.qr_link || fd.qrLink || "",
                                          validation_id:
                                            fd.validation_id ||
                                            fd.validationId ||
                                            "",
                                          confidence_score:
                                            fd.confidence_score ||
                                            fd.confidenceScore ||
                                            0,
                                          liveness_score:
                                            fd.liveness_score ||
                                            fd.livenessScore ||
                                            0,
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
            {/* Botón Cancelar (Volver atrás) */}
            <TouchableOpacity
              style={[styles.actionButton, styles.homeButton]}
              onPress={() => {
                // ✅ FIX: Limpiar memoria antes de salir
                forceCleanup();
                // ✅ Dar más tiempo (300ms)
                setTimeout(() => {
                  router.back();
                }, 300);
              }}
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
