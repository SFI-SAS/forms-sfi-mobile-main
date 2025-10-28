import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  BackHandler,
  Dimensions,
  Animated,
  Easing,
  Image,
  Modal,
  Alert,
  Platform,
  TextInput,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { SvgXml } from "react-native-svg";
import { HomeIcon, InfoIcon } from "../components/Icons";
import { LinearGradient } from "expo-linear-gradient";
import { parseFormDesignToQuestions } from "../utils/formDesignParser";

const { width, height } = Dimensions.get("window");

// Spinner SVG igual que en FormatScreen
const spinnerSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill="#000000FF" stroke="#EE4138FF" stroke-width="15" transform-origin="center" d="m148 84.7 13.8-8-10-17.3-13.8 8a50 50 0 0 0-27.4-15.9v-16h-20v16A50 50 0 0 0 63 67.4l-13.8-8-10 17.3 13.8 8a50 50 0 0 0 0 31.7l-13.8 8 10 17.3 13.8-8a50 50 0 0 0 27.5 15.9v16h20v-16a50 50 0 0 0 27.4-15.9l13.8 8 10-17.3-13.8-8a50 50 0 0 0 0-31.7Zm-47.5 50.8a35 35 0 1 1 0-70 35 35 0 0 1 0 70Z"><animateTransform type="rotate" attributeName="transform" calcMode="spline" dur="1.8" values="0;120" keyTimes="0;1" keySplines="0 0 1 1" repeatCount="indefinite"></animateTransform></path></svg>
`;

const QUESTIONS_KEY = "offline_questions";
const FORMS_METADATA_KEY = "offline_forms_metadata";
const RELATED_ANSWERS_KEY = "offline_related_answers";
const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutos
const BACKEND_URL_KEY = "backend_url";

const getBackendUrl = async () => {
  const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
  return stored || "";
};

// parseFormDesignToQuestions now moved to utils/formDesignParser.js

// --- COMPONENTES REUTILIZABLES ---

// Avatar circular con iniciales
const UserAvatar = ({ name }) => {
  const initials =
    name && typeof name === "string"
      ? name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()
      : "U";
  return (
    <View style={styles.avatarCircle}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  );
};

// Tarjeta de usuario con fondo degradado MUY blanco (90%) a verde (10%) y detalles visuales
const UserCard = ({ userInfo, isOffline, loadingUser, spinAnimUser }) => (
  <LinearGradient
    colors={[
      "#fff",
      "#fff",
      "#e6fafd",
      "#e6fafd",
      "#e6fafd",
      "#e6fafd",
      "#12A0AF",
    ]}
    locations={[0, 0.7, 0.85, 0.92, 0.96, 0.98, 1]}
    start={{ x: 0.6, y: 0 }}
    end={{ x: 0.5, y: 1 }}
    style={styles.userCardGradient}
  >
    <View style={styles.userCardRow}>
      <UserAvatar name={userInfo?.name} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.userNameGreen} numberOfLines={1}>
          {userInfo?.name || ""}
        </Text>
        {loadingUser ? (
          <View style={styles.userLoadingRow}>
            <Animated.View style={{ transform: [{ rotate: spinAnimUser }] }}>
              <SvgXml
                xml={spinnerSvg.replace("#000000FF", "#12A0AF")}
                backgroundColor="#12A0AF"
                width={28}
                height={28}
              />
            </Animated.View>
            <Text style={styles.userLoadingTextGreen}>
              Loading user data...
            </Text>
          </View>
        ) : (
          <View style={styles.userInfoColumn}>
            <View style={styles.userInfoRow}>
              <Text style={styles.userInfoLabelGreen}>Email: </Text>
              <Text style={styles.userInfoValueGreen}>{userInfo?.email}</Text>
            </View>
            <View style={styles.userInfoRow}>
              <Text style={styles.userInfoLabelGreen}>Document: </Text>
              <Text style={styles.userInfoValueGreen}>
                {userInfo?.num_document}
              </Text>
            </View>
            <View style={styles.userInfoRow}>
              <Text style={styles.userInfoLabelGreen}>Phone: </Text>
              <Text style={styles.userInfoValueGreen}>
                {userInfo?.telephone}
              </Text>
            </View>
            <View style={styles.userInfoRow}>
              <Text style={styles.userInfoLabelGreen}>Type: </Text>
              <Text style={styles.userInfoValueGreen}>
                {userInfo?.user_type}
              </Text>
            </View>
          </View>
        )}
      </View>
      <View style={styles.statusPillWrapper}>
        <View style={styles.statusPillBox}>
          <Text
            style={[
              styles.statusPill,
              isOffline ? styles.statusOffline : styles.statusOnline,
            ]}
            numberOfLines={1}
            ellipsizeMode="clip"
            adjustsFontSizeToFit={true}
            minimumFontScale={0.7}
          >
            {isOffline ? "Offline" : "Online"}
          </Text>
        </View>
      </View>
    </View>
  </LinearGradient>
);

// Tarjeta de formulario con sombra y diseño moderno
const FormCard = ({ form, onPress }) => (
  <TouchableOpacity
    style={styles.formCard}
    onPress={onPress}
    activeOpacity={0.85}
  >
    <View style={styles.formCardHeader}>
      <Image
        source={require("../assets/form_icon.png")}
        style={styles.formCardIcon}
        resizeMode="contain"
      />
      <Text style={styles.formCardTitle} numberOfLines={1}>
        {form.title}
      </Text>
    </View>
    <Text style={styles.formCardDesc} numberOfLines={2}>
      {form.description}
    </Text>
  </TouchableOpacity>
);

// NUEVO: Componente para renderizar cada categoría
const CategoryCard = ({ category, onToggle, isExpanded, onFormPress }) => (
  <View style={styles.categoryContainer}>
    <TouchableOpacity
      style={styles.categoryHeader}
      onPress={onToggle}
      activeOpacity={0.8}
    >
      <View style={styles.categoryTitleContainer}>
        <Text style={styles.categoryTitle}>{category.name}</Text>
        <Text style={styles.categoryCount}>
          ({category.forms.length} formato
          {category.forms.length !== 1 ? "s" : ""})
        </Text>
      </View>
      <Text style={styles.expandIcon}>{isExpanded ? "▼" : "▶"}</Text>
    </TouchableOpacity>

    {isExpanded && (
      <View style={styles.formsInCategory}>
        {category.forms.map((form) => (
          <View key={form.id} style={styles.formCardWrapper}>
            <FormCard form={form} onPress={() => onFormPress(form)} />
          </View>
        ))}
      </View>
    )}
  </View>
);

// Barra de tabs inferior fija, ahora incluye Home y maneja navegación global
const BottomTabBar = ({ activeTab, onTabPress }) => (
  <View style={styles.tabBarContainer}>
    <View style={styles.tabBarInner}>
      <TabBarButton
        icon={
          <View style={styles.iconWrapper}>
            <HomeIcon color={activeTab === "home" ? "#12A0AF" : "#64748b"} />
          </View>
        }
        label="Home"
        active={activeTab === "home"}
        onPress={() => onTabPress("home")}
      />
      <TabBarButton
        icon={
          <View style={styles.iconWrapper}>
            <Image
              source={require("../assets/fact_check_25dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.png")}
              style={[
                styles.tabBarIcon,
                { tintColor: activeTab === "my-forms" ? "#12A0AF" : "#64748b" },
              ]}
            />
          </View>
        }
        label="Submitted"
        active={activeTab === "my-forms"}
        onPress={() => onTabPress("my-forms")}
      />
      <TabBarButton
        icon={
          <View style={styles.iconWrapper}>
            <Image
              source={require("../assets/sync_25dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.png")}
              style={[
                styles.tabBarIcon,
                {
                  tintColor:
                    activeTab === "pending-forms" ? "#12A0AF" : "#64748b",
                },
              ]}
            />
          </View>
        }
        label="Pending"
        active={activeTab === "pending-forms"}
        onPress={() => onTabPress("pending-forms")}
      />
      <TabBarButton
        icon={
          <View style={styles.iconWrapper}>
            <Image
              source={require("../assets/logout_25dp_FFFFFF_FILL0_wght400_GRAD0_opsz24 (1).png")}
              style={[
                styles.tabBarIcon,
                { tintColor: activeTab === "logout" ? "#ef4444" : "#64748b" },
              ]}
            />
          </View>
        }
        label="Logout"
        active={activeTab === "logout"}
        onPress={() => onTabPress("logout")}
        danger
      />
    </View>
  </View>
);
const TabBarButton = ({ icon, label, active, onPress, danger }) => (
  <TouchableOpacity
    style={[styles.tabBarButton, active && styles.tabBarButtonActive]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View
      style={[
        styles.tabBarIconContainer,
        active && styles.tabBarIconContainerActive,
        danger && active && styles.tabBarIconContainerDanger,
      ]}
    >
      {icon}
    </View>
    <Text
      style={[
        styles.tabBarLabel,
        active &&
          (danger ? styles.tabBarLabelDanger : styles.tabBarLabelActive),
      ]}
      numberOfLines={1}
    >
      {label}
    </Text>
    {active && (
      <View
        style={[styles.activeIndicator, danger && styles.activeIndicatorDanger]}
      />
    )}
  </TouchableOpacity>
);
// --- FIN COMPONENTES REUTILIZABLES ---

// NUEVO: Componente padre que renderiza la tab-bar SIEMPRE y maneja navegación global
export function AppWithTabBar() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("home");

  // Redirección global según tab seleccionada
  const handleTabPress = (tab) => {
    setActiveTab(tab);
    if (tab === "home") router.replace("/home");
    if (tab === "my-forms") router.replace("/my-forms");
    if (tab === "pending-forms") router.replace("/pending-forms");
    if (tab === "logout") router.replace("/"); // o lógica de logout
  };

  // Detecta ruta actual para mantener el tab activo
  useEffect(() => {
    const path = router.asPath || router.pathname || "";
    if (path.includes("my-forms")) setActiveTab("my-forms");
    else if (path.includes("pending-forms")) setActiveTab("pending-forms");
    else if (path === "/" || path.includes("home")) setActiveTab("home");
    // No cambia para logout, se activa solo al presionar
  }, [router.asPath, router.pathname]);

  return (
    <View style={{ flex: 1 }}>
      {/* Aquí renderiza la pantalla actual */}
      <Home activeTab={activeTab} onTabPress={handleTabPress} />
      <View style={styles.tabBarAbsolute}>
        <BottomTabBar activeTab={activeTab} onTabPress={handleTabPress} />
      </View>
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const [userForms, setUserForms] = useState([]);
  const [categorizedForms, setCategorizedForms] = useState([]); // NUEVO
  const [expandedCategories, setExpandedCategories] = useState({}); // NUEVO
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState(null); // State to store user information
  const [spinAnim] = useState(new Animated.Value(0)); // Spinner animation state
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [spinAnimUser] = useState(new Animated.Value(0));
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const inactivityTimer = useRef(null);
  const hasFetchedRef = useRef(false); // Controlar consultas solo una vez por sesión

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

  // Utilidad para guardar y cargar userInfo de AsyncStorage
  const USER_INFO_KEY = "user_info_offline";

  // NUEVA FUNCIÓN: Organizar formularios por categorías
  const organizeByCategorys = (formsList) => {
    const categoriesMap = {};

    formsList.forEach((form) => {
      const categoryName = form.category?.name || "Sin Categoría";
      const categoryId = form.category?.id || "no-category";

      if (!categoriesMap[categoryId]) {
        categoriesMap[categoryId] = {
          id: categoryId,
          name: categoryName,
          forms: [],
        };
      }

      categoriesMap[categoryId].forms.push(form);
    });

    // Convertir objeto a array y ordenar
    const categoriesArray = Object.values(categoriesMap).sort((a, b) => {
      // Poner "Sin Categoría" al final
      if (a.id === "no-category") return 1;
      if (b.id === "no-category") return -1;
      return a.name.localeCompare(b.name);
    });

    setCategorizedForms(categoriesArray);
  };

  // NUEVA FUNCIÓN: Alternar expansión de categoría
  const toggleCategory = (categoryId) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

  // ✅ OPTIMIZADO: Función auxiliar para extraer logo URL
  const findLogoInDesign = (formDesign) => {
    if (!Array.isArray(formDesign)) return null;

    for (const item of formDesign) {
      // Caso 1: logo directo
      if (item.logo) {
        return typeof item.logo === "string" ? item.logo : item.logo.url;
      }

      // Caso 2: tipo logo con props
      if (item.type === "logo" && item.props && item.props.url) {
        return item.props.url;
      }
    }

    return null;
  };

  const extractLogoUrl = (form, qData) => {
    // Buscar en form.form_design
    let logoUrl = findLogoInDesign(form.form_design);

    // Si no está, buscar en qData.form_design
    if (!logoUrl) {
      logoUrl = findLogoInDesign(qData.form_design);
    }

    return logoUrl;
  };

  // ✅ OPTIMIZADO: Guarda la info de usuario en AsyncStorage (no-bloqueante)
  const saveUserInfoOffline = async (user) => {
    try {
      // Usar setTimeout para no bloquear el hilo principal
      setTimeout(async () => {
        await AsyncStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
      }, 0);
    } catch (e) {
      console.error("❌ Error guardando userInfo offline:", e);
    }
  };

  // Carga la info de usuario desde AsyncStorage
  const loadUserInfoOffline = async () => {
    setLoadingUser(true);
    try {
      const stored = await AsyncStorage.getItem(USER_INFO_KEY);
      if (stored) setUserInfo(JSON.parse(stored));
    } catch (e) {
      console.error("❌ Error cargando userInfo offline:", e);
    } finally {
      setLoadingUser(false);
    }
  };

  // ✅ OPTIMIZADO: Carga la info de usuario desde el servidor
  const fetchUserInfo = async () => {
    setLoadingUser(true);
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");
      const backendUrl = await getBackendUrl();
      const response = await fetch(`${backendUrl}/auth/validate-token`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Error fetching user information");
      }

      const data = await response.json();

      // ✅ MOSTRAR DATOS INMEDIATAMENTE
      setUserInfo(data.user);
      setLoadingUser(false); // Ocultar spinner inmediatamente

      // ✅ GUARDAR EN BACKGROUND
      saveUserInfoOffline(data.user).catch((error) => {
        console.error("❌ Error guardando userInfo offline:", error);
      });
    } catch (error) {
      console.error("❌ Error fetching user information:", error);
      // Si falla online, intenta cargar offline
      loadUserInfoOffline();
    }
  };

  // ✅ OPTIMIZADO: Función para fetchAndCacheQuestionsAndRelated con batches
  const fetchAndCacheQuestionsAndRelated = async (forms, token) => {
    // Crear batches más pequeños para no bloquear la UI
    const BATCH_SIZE = 3; // Procesar 3 formularios a la vez

    let allQuestions = {};
    let allFormsMetadata = {};
    let allRelatedAnswers = {};

    // Procesar formularios en batches
    for (let i = 0; i < forms.length; i += BATCH_SIZE) {
      const batch = forms.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (form) => {
        try {
          const backendUrl = await getBackendUrl();
          const qRes = await fetch(`${backendUrl}/forms/${form.id}`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });
          const qData = await qRes.json();
          //console.log(`[DEBUG][fetchQuestions] formId=${form.id} qData:`, qData); // <--- LOG DE PREGUNTAS
          //console.log(`[DEBUG][fetchQuestions prueba] formId=${form.id} qData:`, qData); // <--- LOG DE PREGUNTAS

          if (!qRes.ok)
            throw new Error(qData.detail || "Error fetching questions");

          // Procesar preguntas: preferir form_design como fuente de verdad
          let adjustedQuestions = [];
          // Preferir form_design como fuente de verdad. Aceptar objetos o arrays
          const designSource = qData.form_design || qData.format_design || null;
          if (designSource) {
            // Use only form_design as the source of truth — do NOT pass qData.questions
            adjustedQuestions = parseFormDesignToQuestions(designSource);
          } else if (Array.isArray(qData.questions)) {
            // Fallback al comportamiento previo
            adjustedQuestions = qData.questions.map((question) => {
              if (
                (question.question_type === "multiple_choice" ||
                  question.question_type === "one_choice") &&
                Array.isArray(question.options)
              ) {
                return {
                  ...question,
                  options: question.options.map((option) => option.option_text),
                };
              }
              if (question.question_type === "table") {
                return { ...question, options: [] };
              }
              return question;
            });
          }

          // 2. Obtener respuestas relacionadas para preguntas tipo tabla
          const tableQuestions = adjustedQuestions.filter(
            (q) => q.question_type === "table"
          );
          const relatedPromises = tableQuestions.map(async (question) => {
            try {
              const relRes = await fetch(
                `${backendUrl}/questions/question-table-relation/answers/${question.id}`,
                {
                  method: "GET",
                  headers: { Authorization: `Bearer ${token}` },
                }
              );
              const relData = await relRes.json();
              //console.log(`[DEBUG][fetchRelatedAnswers] formId=${form.id} relatedResults:`, relData); // <--- LOG DE RELACIONADAS
              // --- FIX: Guarda data como array de strings ---
              return {
                questionId: question.id,
                data: Array.isArray(relData.data)
                  ? relData.data
                      .map((item) =>
                        typeof item === "object" && item.name
                          ? item.name
                          : typeof item === "string"
                            ? item
                            : ""
                      )
                      .filter((v) => typeof v === "string" && v.length > 0)
                  : [],
                correlations: relData.correlations || {},
                related_question: relData.related_question || null,
                source: relData.source || "",
              };
            } catch (e) {
              return {
                questionId: question.id,
                data: [],
                correlations: {},
                related_question: null,
                source: "",
              };
            }
          });

          const relatedResults = await Promise.all(relatedPromises);
          // Guarda answers, correlaciones y pregunta relacionada en relatedAnswers
          const relatedAnswersObj = {};
          relatedResults.forEach(
            ({ questionId, data, correlations, related_question, source }) => {
              relatedAnswersObj[questionId] = {
                data,
                correlations,
                related_question,
                source,
              };
            }
          );

          return {
            formId: form.id,
            questions: adjustedQuestions,
            form_design: qData.form_design || qData.format_design || null,
            metadata: {
              title: qData.title,
              description: qData.description,
              logo_url: extractLogoUrl(form, qData),
            },
            relatedAnswers: relatedAnswersObj,
          };
        } catch (e) {
          console.error(`❌ Error procesando formulario ${form.id}:`, e);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);

      batchResults.forEach((result) => {
        if (result) {
          // Store both parsed questions and original form_design for rendering
          allQuestions[result.formId] = {
            questions: result.questions,
            form_design: result.form_design || null,
          };
          allFormsMetadata[result.formId] = result.metadata;
          // --- FIX: Merge relatedAnswers por pregunta ---
          Object.assign(allRelatedAnswers, result.relatedAnswers);
        }
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Guardar todo en AsyncStorage al final
    try {
      await Promise.all([
        AsyncStorage.setItem(QUESTIONS_KEY, JSON.stringify(allQuestions)),
        AsyncStorage.setItem(
          FORMS_METADATA_KEY,
          JSON.stringify(allFormsMetadata)
        ),
        AsyncStorage.setItem(
          RELATED_ANSWERS_KEY,
          JSON.stringify(allRelatedAnswers)
        ),
      ]);
      //console.log("✅ Datos cacheados exitosamente en background");
    } catch (error) {
      console.error("❌ Error guardando cache:", error);
    }
  };

  // ✅ OPTIMIZADO: Función principal fetchUserForms
  const fetchUserForms = async ({ skipCacheIfUnchanged = true } = {}) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");
      const backendUrl = await getBackendUrl();
      const response = await fetch(`${backendUrl}/forms/users/form_by_user`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Error fetching user forms");
      }

      // Leer cache previa para detectar cambios y evitar trabajos innecesarios
      let previousRaw = null;
      try {
        previousRaw = await AsyncStorage.getItem("offline_forms");
      } catch (_) {}

      const newRaw = JSON.stringify(data);
      const unchanged = previousRaw && previousRaw === newRaw;

      // ✅ MOSTRAR DATOS INMEDIATAMENTE
      setUserForms(data);
      organizeByCategorys(data);
      setLoading(false); // Ocultar spinner inmediatamente

      // ✅ GUARDAR EN BACKGROUND (no bloquear UI), solo si cambió o si no queremos saltarlo
      if (!skipCacheIfUnchanged || !unchanged) {
        Promise.all([
          AsyncStorage.setItem("offline_forms", newRaw),
          fetchAndCacheQuestionsAndRelated(data, token),
        ])
          .then(async () => {
            const ts = new Date().toISOString();
            setLastSyncAt(ts);
            try {
              await AsyncStorage.setItem("last_sync_at", ts);
            } catch (_) {}
          })
          .catch((error) => {
            console.error("❌ Error en operaciones de background:", error);
          });
      }
    } catch (error) {
      console.error("❌ Error al obtener los formularios del usuario:", error);
      setLoading(false);
    }
  };

  const loadOfflineForms = async () => {
    try {
      const storedForms = await AsyncStorage.getItem("offline_forms");
      if (storedForms) {
        const forms = JSON.parse(storedForms);
        setUserForms(forms);
        // NUEVO: Organizar por categorías también offline
        organizeByCategorys(forms);
      } else {
        Alert.alert("Modo Offline", "No hay datos guardados para mostrar.");
      }
    } catch (error) {
      console.error("❌ Error cargando formularios offline:", error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ NUEVA FUNCIÓN: Pre-cargar datos críticos desde cache
  const preloadCriticalData = async () => {
    try {
      // Cargar datos críticos que ya están en cache
      const [storedForms, storedUserInfo] = await Promise.all([
        AsyncStorage.getItem("offline_forms"),
        AsyncStorage.getItem(USER_INFO_KEY),
      ]);

      if (storedForms) {
        const forms = JSON.parse(storedForms);
        setUserForms(forms);
        organizeByCategorys(forms);
        setLoading(false);
      }

      if (storedUserInfo) {
        setUserInfo(JSON.parse(storedUserInfo));
        setLoadingUser(false);
      }
    } catch (error) {
      console.error("❌ Error precargando datos:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.setItem("isLoggedOut", "true");
      // Limpia el token si quieres forzar login limpio:
      // await AsyncStorage.removeItem("authToken");
      router.replace("/"); // Usa replace para evitar volver atrás con el botón de Android
    } catch (error) {
      Alert.alert("Error", "No se pudo cerrar sesión. Inténtalo de nuevo.");
    }
  };

  const handleFormPress = (form) => {
    console.log("📋 Formulario seleccionado:", form.id);
    router.push({
      pathname: "/format-screen",
      params: {
        id: form.id,
        created_at: form.created_at,
        title: form.title,
      },
    });
  };

  const handleNavigateToMyForms = () => {
    router.push("/my-forms");
  };

  const handleNavigateToPendingForms = () => {
    router.push("/pending-forms");
  };

  // ✅ NUEVO: Pre-cargar datos inmediatamente desde cache
  useEffect(() => {
    // Pre-cargar datos inmediatamente desde cache
    preloadCriticalData();
  }, []);

  // ✅ CONTROLADO: useEffect principal SOLO consulta la primera vez
  useEffect(() => {
    const controlledInitialFetch = async () => {
      const state = await NetInfo.fetch();
      setIsOffline(!state.isConnected);

      // Cargar última sincronización
      try {
        const ts = await AsyncStorage.getItem("last_sync_at");
        if (ts) setLastSyncAt(ts);
      } catch (_) {}

      // Solo consultar en el primer render
      if (!hasFetchedRef.current) {
        hasFetchedRef.current = true;
        await refreshAll({ force: false });
      }
    };

    controlledInitialFetch();

    // Mantener listener solo para estado offline/online, sin consultas
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });

    return () => unsubscribe();
  }, []);

  // Acción controlada: refrescar bajo demanda
  const refreshAll = async ({ force = false } = {}) => {
    try {
      setRefreshing(true);
      setLoading(true);
      const state = await NetInfo.fetch();
      setIsOffline(!state.isConnected);

      if (state.isConnected) {
        await Promise.all([
          fetchUserForms({ skipCacheIfUnchanged: !force }),
          fetchUserInfo(),
        ]);
      } else {
        await Promise.all([loadOfflineForms(), loadUserInfoOffline()]);
      }

      // Guardar timestamp de sync si hubo conexión
      if (state.isConnected) {
        const ts = new Date().toISOString();
        setLastSyncAt(ts);
        try {
          await AsyncStorage.setItem("last_sync_at", ts);
        } catch (_) {}
      }
    } catch (e) {
      console.error("❌ Error en refreshAll:", e);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loading) {
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
  }, [loading]);

  // Animación de spinner para usuario
  useEffect(() => {
    if (loadingUser) {
      Animated.loop(
        Animated.timing(spinAnimUser, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinAnimUser.stopAnimation();
      spinAnimUser.setValue(0);
    }
  }, [loadingUser]);

  const spin = spinAnimUser.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // --- Inactividad: logout automático ---
  const resetInactivityTimer = async () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(async () => {
      await AsyncStorage.setItem("isLoggedOut", "true");
      await AsyncStorage.removeItem("authToken");
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
    const interval = setInterval(reset, 1000 * 60 * 4); // refuerzo cada 4 min

    // Touch events (for ScrollView, Touchable, etc.)
    // No hay addEventListener global en RN, pero puedes usar onTouchStart/onScroll en ScrollView, etc.
    reset();

    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      subscription.remove();
      clearInterval(interval);
    };
  }, []);

  // Filtrar formularios por búsqueda
  useEffect(() => {
    if (searchText.trim() === "") {
      setSearchResults([]);
      return;
    }
    const text = searchText.trim().toLowerCase();
    const results = userForms.filter(
      (form) =>
        (form.title && form.title.toLowerCase().includes(text)) ||
        (form.description && form.description.toLowerCase().includes(text))
    );
    setSearchResults(results);
  }, [searchText, userForms]);

  return (
    <LinearGradient
      colors={["#4B34C7", "#4B34C7"]}
      style={styles.fullBackground}
    >
      <View style={styles.container}>
        {/* Fondo decorativo superior eliminado, ahora todo el fondo es morado */}
        <Text style={styles.sectionTitleWhite}>Welcome</Text>
        <UserCard
          userInfo={userInfo}
          isOffline={isOffline}
          loadingUser={loadingUser}
          spinAnimUser={spin}
        />

        {/* Apartado de búsqueda */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="🔍 Buscar formato"
            value={searchText}
            onChangeText={setSearchText}
            placeholderTextColor="#888"
          />
        </View>

        {/* Mueve el título y las categorías hacia abajo */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitleWhite, { marginTop: 12, marginBottom: 0 }]}>
            Assigned forms
          </Text>
          <TouchableOpacity
            style={[styles.refreshButton, (refreshing || loading) && styles.refreshButtonDisabled]}
            onPress={() => refreshAll({ force: true })}
            disabled={refreshing || loading}
            activeOpacity={0.8}
          >
            <Image
              source={require("../assets/sync_25dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.png")}
              style={styles.refreshIcon}
              resizeMode="contain"
            />
            <Text style={styles.refreshLabel}>
              {refreshing ? "Updating..." : "Refresh"}
            </Text>
          </TouchableOpacity>
        </View>
        {lastSyncAt && (
          <Text style={styles.lastSyncText} numberOfLines={1}>
            Last sync: {new Date(lastSyncAt).toLocaleString()}
          </Text>
        )}
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: height * 0.11,
          }}
          style={{ flex: 1 }}
        >
          {loading ? (
            <View style={{ alignItems: "center", marginVertical: 30 }}>
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <SvgXml
                  xml={spinnerSvg.replace("#000000FF", "#fff")}
                  width={40}
                  height={40}
                />
              </Animated.View>
              <Text style={styles.loadingTextWhite}>Loading...</Text>
            </View>
          ) : (
            <View style={styles.formsScrollWrapper}>
              <LinearGradient
                colors={[
                  "#fff",
                  "#fff",
                  "#e6fafd",
                  "#e6fafd",
                  "#e6fafd",
                  "#e6fafd",
                  "#12A0AF",
                ]}
                locations={[0, 0.7, 0.85, 0.92, 0.96, 0.98, 1]}
                start={{ x: 0.6, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.formsGradientBg}
              >
                <ScrollView
                  style={styles.formsContainer}
                  contentContainerStyle={{
                    paddingBottom: 10,
                    paddingHorizontal: width * 0.03,
                  }}
                  showsVerticalScrollIndicator={false}
                  horizontal={false}
                >
                  {/* Si hay búsqueda, muestra solo los resultados filtrados */}
                  {searchText.trim() !== "" ? (
                    searchResults.length === 0 ? (
                      <Text style={styles.loadingText}>
                        No se encontraron formatos.
                      </Text>
                    ) : (
                      searchResults.map((form) => (
                        <View key={form.id} style={styles.formCardWrapper}>
                          <FormCard
                            form={form}
                            onPress={() => handleFormPress(form)}
                          />
                        </View>
                      ))
                    )
                  ) : (
                    // Si no hay búsqueda, muestra las categorías como antes
                    categorizedForms.map((category) => (
                      <CategoryCard
                        key={category.id}
                        category={category}
                        isExpanded={!!expandedCategories[category.id]}
                        onToggle={() => toggleCategory(category.id)}
                        onFormPress={handleFormPress}
                      />
                    ))
                  )}
                </ScrollView>
              </LinearGradient>
            </View>
          )}
        </ScrollView>
        {/* Barra de tabs inferior */}
        {/* <View style={styles.tabBarAbsolute}>
          <BottomTabBar onTabPress={handleTabPress} activeTab={activeTab} />
        </View> */}
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
                Session closed due to inactivity
              </Text>
              <Text
                style={{
                  fontSize: width * 0.04,
                  color: "#444",
                  marginBottom: 12,
                  textAlign: "center",
                }}
              >
                For security, your session was closed automatically after 2
                minutes of inactivity.
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
                  router.replace("/");
                }}
              >
                <Text
                  style={{
                    color: "white",
                    fontWeight: "bold",
                    fontSize: width * 0.045,
                  }}
                >
                  Go to login
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </LinearGradient>
  );
}

// --- NUEVOS ESTILOS MODERNOS ---
const styles = StyleSheet.create({
  fullBackground: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
    position: "relative",
    paddingBottom: 0,
  },
  topBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    width: width,
    height: height * 0.22,
    backgroundColor: "#4B34C7",
    borderBottomLeftRadius: width * 0.15,
    borderBottomRightRadius: width * 0.15,
    zIndex: 0,
    opacity: 0.95,
  },
  sectionTitle: {
    fontSize: width * 0.055,
    fontWeight: "bold",
    color: "#222",
    marginTop: height * 0.04,
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: 0.2,
    zIndex: 1,
  },
  sectionTitleWhite: {
    fontSize: width * 0.055,
    fontWeight: "bold",
    color: "#fff",
    marginTop: height * 0.04,
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: 0.2,
    zIndex: 1,
    textShadowColor: "#0002",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: width * 0.04,
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#12A0AF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  refreshButtonDisabled: {
    opacity: 0.6,
  },
  refreshIcon: {
    width: width * 0.05,
    height: width * 0.05,
    tintColor: "#fff",
    marginRight: 6,
  },
  refreshLabel: {
    color: "#fff",
    fontWeight: "bold",
  },
  lastSyncText: {
    color: "#e2e8f0",
    textAlign: "right",
    paddingHorizontal: width * 0.04,
    marginTop: 4,
    fontSize: width * 0.03,
  },
  // --- UserCard ---
  userCardGradient: {
    borderRadius: width * 0.04,
    marginHorizontal: width * 0.04,
    marginBottom: height * 0.02,
    padding: width * 0.04,
    shadowColor: "#000",
    shadowOpacity: 0.09,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 2,
    flexDirection: "column",
    minHeight: height * 0.16,
  },
  userCardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarCircle: {
    width: width * 0.14,
    height: width * 0.14,
    borderRadius: width * 0.07,
    backgroundColor: "#12A0AF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    shadowColor: "#12A0AF",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  avatarText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: width * 0.055,
    //letterSpacing: 1,
  },
  userName: {
    fontSize: width * 0.045,
    fontWeight: "bold",
    color: "#222",
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  userNameGreen: {
    fontSize: width * 0.045,
    fontWeight: "bold",
    color: "#12A0AF",
    marginBottom: 4,
    letterSpacing: 0.2,
    textShadowColor: "#fff8",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  userInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  userInfoColumn: {
    flexDirection: "column",
    marginTop: 4,
  },
  userInfoLabel: {
    fontSize: width * 0.032,
    color: "#888",
    fontWeight: "bold",
  },
  userInfoLabelGreen: {
    fontSize: width * 0.032,
    color: "#12A0AF",
    fontWeight: "bold",
  },
  userInfoValue: {
    fontSize: width * 0.032,
    color: "#444",
    marginLeft: 2,
    flexShrink: 1,
  },
  userInfoValueGreen: {
    fontSize: width * 0.032,
    color: "#222",
    marginLeft: 2,
    flexShrink: 1,
  },
  statusPillWrapper: {
    alignItems: "flex-end",
    justifyContent: "flex-start",
    marginLeft: 8,
    maxWidth: width * 0.22,
  },
  statusPillBox: {
    minWidth: width * 0.13,
    maxWidth: width * 0.22,
    alignItems: "center",
    justifyContent: "center",
  },
  statusPill: {
    fontSize: width * 0.032,
    fontWeight: "bold",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    overflow: "hidden",
    textAlign: "center",
    marginTop: 2,
    color: "#fff",
    width: "100%",
  },
  statusOnline: {
    backgroundColor: "#22c55e",
  },
  statusOffline: {
    backgroundColor: "#ef4444",
  },
  // --- FormCard ---
  formsScrollWrapper: {
    flex: 1,
    marginHorizontal: width * 0.03,
    marginBottom: height * 0.01,
    borderRadius: width * 0.035,
    overflow: "hidden",
    maxHeight: height - (height * 0.11 + height * 0.18), // 0.11 tab-bar, 0.18 aprox header/user
  },
  formsGradientBg: {
    flex: 1,
    borderRadius: width * 0.035,
    paddingVertical: 8,
    paddingHorizontal: 2,
    // No shadow, solo fondo difuminado
  },
  formsContainer: {
    flexGrow: 0,
    maxHeight: height * 0.5,
  },
  formCardWrapper: {
    marginBottom: height * 0.018,
    borderRadius: width * 0.035,
    overflow: "visible",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    backgroundColor: "transparent",
  },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: width * 0.035,
    padding: width * 0.04,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    // Sombra ya está en el wrapper
  },
  formCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  formCardIcon: {
    width: width * 0.08,
    height: width * 0.08,
    marginRight: 10,
    tintColor: "#12A0AF",
  },
  formCardTitle: {
    fontSize: width * 0.042,
    fontWeight: "bold",
    color: "#4B34C7",
    flex: 1,
  },
  formCardDesc: {
    fontSize: width * 0.032,
    color: "#444",
    marginTop: 2,
  },
  // --- TabBar ---
  tabBarAbsolute: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    backgroundColor: "transparent",
  },
  tabBarContainer: {
    backgroundColor: "#ffffff",
    borderTopWidth: 0,
    paddingVertical: 8,
    paddingBottom: Platform.OS === "ios" ? 20 : 10,
    paddingHorizontal: 8,
    elevation: 20,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
  },
  tabBarInner: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  tabBarButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 16,
    position: "relative",
    minHeight: 60,
  },
  tabBarButtonActive: {
    backgroundColor: "rgba(18, 160, 175, 0.08)",
  },
  iconWrapper: {
    width: width * 0.08,
    height: width * 0.08,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBarIconContainer: {
    marginBottom: 4,
    transform: [{ scale: 1 }],
  },
  tabBarIconContainerActive: {
    transform: [{ scale: 1.1 }],
  },
  tabBarIconContainerDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderRadius: 12,
    padding: 6,
  },
  tabBarIcon: {
    width: width * 0.065,
    height: width * 0.065,
  },
  tabBarLabel: {
    fontSize: width * 0.028,
    color: "#64748b",
    fontWeight: "600",
    marginTop: 2,
    textAlign: "center",
  },
  tabBarLabelActive: {
    color: "#12A0AF",
    fontWeight: "700",
  },
  tabBarLabelDanger: {
    color: "#ef4444",
    fontWeight: "700",
  },
  activeIndicator: {
    position: "absolute",
    bottom: 2,
    width: 32,
    height: 3,
    backgroundColor: "#12A0AF",
    borderRadius: 2,
  },
  activeIndicatorDanger: {
    backgroundColor: "#ef4444",
  },
  tabBarIcon: {
    width: width * 0.07,
    height: width * 0.07,
    marginBottom: 2,
    tintColor: "#4B34C7",
  },
  tabBarLabel: {
    fontSize: width * 0.032,
    color: "#4B34C7",
    fontWeight: "bold",
  },
  tabBarLabelActive: {
    color: "#12A0AF",
  },
  tabBarLabelDanger: {
    color: "#ef4444",
  },
  // --- Otros ---
  loadingText: {
    fontSize: width * 0.045,
    textAlign: "center",
    marginVertical: height * 0.02,
    color: "#4B34C7",
  },
  userLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  userLoadingTextGreen: {
    color: "#12A0AF",
    fontSize: width * 0.035,
    marginLeft: 8,
    fontWeight: "bold",
    letterSpacing: 0.2,
  },
  // NUEVOS ESTILOS PARA CATEGORÍAS
  categoryContainer: {
    marginBottom: height * 0.02,
    borderRadius: width * 0.035,
    overflow: "hidden",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  categoryHeader: {
    backgroundColor: "#f7f7f9",
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  categoryTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  categoryTitle: {
    fontSize: width * 0.04,
    fontWeight: "bold",
    color: "#333",
    marginRight: 7,
  },
  categoryCount: {
    fontSize: width * 0.035,
    color: "#666",
    fontWeight: "500",
  },
  expandIcon: {
    fontSize: width * 0.045,
    color: "#12A0AF",
    lineHeight: 24,
  },
  formsInCategory: {
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  searchContainer: {
    marginHorizontal: width * 0.04,
    marginBottom: 8,
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: width * 0.03,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  searchInput: {
    fontSize: width * 0.042,
    color: "#222",
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
});

// Cuando guardas las respuestas relacionadas en AsyncStorage, asegúrate de guardar la estructura correcta.
// El objeto debe tener la forma:
// { [questionId]: { data: [{name: "valor"}], correlations: {...}, ... } }
const fetchAndCacheRelatedAnswers = async (
  formId,
  questions,
  token,
  backendUrl
) => {
  try {
    const relatedAnswers = {};
    for (const question of questions) {
      if (question.question_type === "table") {
        const res = await fetch(
          `${backendUrl}/questions/question-table-relation/answers/${question.id}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const relData = await res.json();
        // --- FIX: Guarda la estructura completa, pero data como array de strings ---
        relatedAnswers[question.id] = {
          data: Array.isArray(relData.data)
            ? relData.data
                .map((item) =>
                  typeof item === "object" && item.name
                    ? item.name
                    : typeof item === "string"
                      ? item
                      : ""
                )
                .filter((v) => typeof v === "string" && v.length > 0)
            : [],
          correlations: relData.correlations || {},
          related_question: relData.related_question || null,
          source: relData.source || "",
        };
      }
    }
    await AsyncStorage.setItem(
      RELATED_ANSWERS_KEY,
      JSON.stringify(relatedAnswers)
    );
    // ...existing code...
  } catch (e) {
    // ...existing code...
  }
};
