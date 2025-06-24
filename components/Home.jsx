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
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { SvgXml } from "react-native-svg";
import { HomeIcon, InfoIcon } from "../components/Icons";
import { LinearGradient } from "expo-linear-gradient";

const { width, height } = Dimensions.get("window");

// Spinner SVG igual que en FormatScreen
const spinnerSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill="#000000FF" stroke="#EE4138FF" stroke-width="15" transform-origin="center" d="m148 84.7 13.8-8-10-17.3-13.8 8a50 50 0 0 0-27.4-15.9v-16h-20v16A50 50 0 0 0 63 67.4l-13.8-8-10 17.3 13.8 8a50 50 0 0 0 0 31.7l-13.8 8 10 17.3 13.8-8a50 50 0 0 0 27.5 15.9v16h20v-16a50 50 0 0 0 27.4-15.9l13.8 8 10-17.3-13.8-8a50 50 0 0 0 0-31.7Zm-47.5 50.8a35 35 0 1 1 0-70 35 35 0 0 1 0 70Z"><animateTransform type="rotate" attributeName="transform" calcMode="spline" dur="1.8" values="0;120" keyTimes="0;1" keySplines="0 0 1 1" repeatCount="indefinite"></animateTransform></path></svg>
`;

const QUESTIONS_KEY = "offline_questions";
const FORMS_METADATA_KEY = "offline_forms_metadata";
const RELATED_ANSWERS_KEY = "offline_related_answers";
const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutos

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

// Barra de tabs inferior fija, ahora incluye Home y maneja navegación global
const BottomTabBar = ({ activeTab, onTabPress }) => (
  <View style={styles.tabBarContainer}>
    <TabBarButton
      icon={<HomeIcon color={activeTab === "home" ? "#12A0AF" : "#4B34C7"} />}
      label="Home"
      active={activeTab === "home"}
      onPress={() => onTabPress("home")}
    />
    <TabBarButton
      icon={
        <Image
          source={require("../assets/fact_check_25dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.png")}
          style={[
            styles.tabBarIcon,
            activeTab === "my-forms" && { tintColor: "#12A0AF" },
          ]}
        />
      }
      label="Submitted"
      active={activeTab === "my-forms"}
      onPress={() => onTabPress("my-forms")}
    />
    <TabBarButton
      icon={
        <Image
          source={require("../assets/sync_25dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.png")}
          style={[
            styles.tabBarIcon,
            activeTab === "pending-forms" && { tintColor: "#12A0AF" },
          ]}
        />
      }
      label="Pending"
      active={activeTab === "pending-forms"}
      onPress={() => onTabPress("pending-forms")}
    />
    <TabBarButton
      icon={
        <Image
          source={require("../assets/logout_25dp_FFFFFF_FILL0_wght400_GRAD0_opsz24 (1).png")}
          style={[
            styles.tabBarIcon,
            activeTab === "logout" && { tintColor: "#ef4444" },
          ]}
        />
      }
      label="Logout"
      active={activeTab === "logout"}
      onPress={() => onTabPress("logout")}
      danger
    />
  </View>
);

const TabBarButton = ({ icon, label, active, onPress, danger }) => (
  <TouchableOpacity
    style={[
      styles.tabBarButton,
      active && styles.tabBarButtonActive,
      danger && styles.tabBarButtonDanger,
    ]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    {typeof icon === "string" ? (
      <Image source={icon} style={styles.tabBarIcon} />
    ) : (
      icon
    )}
    <Text
      style={[
        styles.tabBarLabel,
        active && styles.tabBarLabelActive,
        danger && styles.tabBarLabelDanger,
      ]}
    >
      {label}
    </Text>
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

// Modifica Home para recibir activeTab y onTabPress como props
export default function Home({ activeTab, onTabPress }) {
  const router = useRouter();
  const [userForms, setUserForms] = useState([]);
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState(null); // State to store user information
  const [spinAnim] = useState(new Animated.Value(0)); // Spinner animation state
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [spinAnimUser] = useState(new Animated.Value(0));
  const inactivityTimer = useRef(null);

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
  const FORMS_KEY = "offline_forms";
  const PENDING_FORMS_KEY = "pending_forms";

  // Guarda la info de usuario en AsyncStorage
  const saveUserInfoOffline = async (user) => {
    try {
      await AsyncStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
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

  // Carga la info de usuario desde el servidor
  const fetchUserInfo = async () => {
    setLoadingUser(true);
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");

      const response = await fetch(
        "https://api-forms-sfi.service.saferut.com/auth/validate-token",
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        throw new Error("Error fetching user information");
      }

      const data = await response.json();
      setUserInfo(data.user); // Save user information
      saveUserInfoOffline(data.user); // Guarda siempre la info online/offline
    } catch (error) {
      console.error("❌ Error fetching user information:", error);
      // Si falla online, intenta cargar offline
      loadUserInfoOffline();
    } finally {
      setLoadingUser(false);
    }
  };

  const fetchAndCacheQuestionsAndRelated = async (forms, token) => {
    // Guarda preguntas y respuestas relacionadas para cada formulario
    let allQuestions = {};
    let allFormsMetadata = {};
    let allRelatedAnswers = {};

    for (const form of forms) {
      try {
        // 1. Preguntas del formulario
        const qRes = await fetch(
          `https://api-forms-sfi.service.saferut.com/forms/${form.id}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
        const qData = await qRes.json();
        if (!qRes.ok)
          throw new Error(qData.detail || "Error fetching questions");

        // Ajusta opciones para multiple_choice/one_choice
        const adjustedQuestions = qData.questions.map((question) => {
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
          // Para preguntas tipo tabla, las opciones se llenan con las relacionadas
          if (question.question_type === "table") {
            // Las opciones se llenarán después con las relacionadas
            return { ...question, options: [] };
          }
          return question;
        });

        allQuestions[form.id] = adjustedQuestions;
        allFormsMetadata[form.id] = {
          title: qData.title,
          description: qData.description,
        };

        // 2. Respuestas relacionadas para preguntas tipo tabla
        for (const question of adjustedQuestions) {
          if (question.question_type === "table") {
            try {
              const relRes = await fetch(
                `https://api-forms-sfi.service.saferut.com/questions/question-table-relation/answers/${question.id}`,
                {
                  method: "GET",
                  headers: { Authorization: `Bearer ${token}` },
                }
              );
              const relData = await relRes.json();
              // relData.data es un array de objetos con { name }
              // Guarda las opciones relacionadas para la pregunta
              allRelatedAnswers[question.id] = Array.isArray(relData.data)
                ? relData.data.map((item) => item.name)
                : [];
            } catch (e) {
              allRelatedAnswers[question.id] = [];
            }
          }
        }
      } catch (e) {
        continue;
      }
    }

    // Guarda todo en AsyncStorage
    await AsyncStorage.setItem(QUESTIONS_KEY, JSON.stringify(allQuestions));
    await AsyncStorage.setItem(
      FORMS_METADATA_KEY,
      JSON.stringify(allFormsMetadata)
    );
    await AsyncStorage.setItem(
      RELATED_ANSWERS_KEY,
      JSON.stringify(allRelatedAnswers)
    );
  };

  const fetchUserForms = async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");

      const response = await fetch(
        "https://api-forms-sfi.service.saferut.com/forms/users/form_by_user",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Error fetching user forms");
      }
      setUserForms(data);

      // Cache forms for offline access
      await AsyncStorage.setItem("offline_forms", JSON.stringify(data));

      // NUEVO: Guarda preguntas y respuestas relacionadas de todos los formularios
      await fetchAndCacheQuestionsAndRelated(data, token);
    } catch (error) {
      console.error("❌ Error al obtener los formularios del usuario:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadOfflineForms = async () => {
    try {
      const storedForms = await AsyncStorage.getItem("offline_forms");
      if (storedForms) {
        setUserForms(JSON.parse(storedForms));
      } else {
        Alert.alert("Modo Offline", "No hay datos guardados para mostrar.");
      }
    } catch (error) {
      console.error("❌ Error cargando formularios offline:", error);
    } finally {
      setLoading(false);
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
    console.log("📋 Formulario seleccionado:", form); // Log the selected form
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

  // Modifica la sincronización de formularios pendientes para enviar también el serial offline asociado a cada archivo
  useEffect(() => {
    const checkNetworkStatus = async () => {
      const state = await NetInfo.fetch();
      setIsOffline(!state.isConnected);

      if (state.isConnected) {
        await fetchUserForms();
        fetchUserInfo();
        // Ya NO sincroniza automáticamente los pending_forms aquí.
        // Solo carga formularios y usuario.
      } else {
        await loadOfflineForms();
        loadUserInfoOffline();
      }
    };

    checkNetworkStatus();

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
      // Ya NO sincroniza automáticamente los pending_forms aquí.
    });

    return () => unsubscribe();
  }, []);

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

  // --- NOTIFICACIONES NATIVAS ---
  // useEffect(() => {
  //   // Solo ejecutar notificaciones si NO estamos en Expo Go
  //   const isExpoGo =
  //     typeof Constants !== "undefined" && Constants.appOwnership === "expo";
  //   if (isExpoGo) return;

  //   const checkPendingFormsAndNotify = async () => {
  //     try {
  //       const pending = await AsyncStorage.getItem("pending_forms");
  //       if (pending) {
  //         const pendingArr = JSON.parse(pending);
  //         if (Array.isArray(pendingArr) && pendingArr.length > 0) {
  //           await Notifications.scheduleNotificationAsync({
  //             content: {
  //               title: "Tienes formularios pendientes",
  //               body: `Hay ${pendingArr.length} formularios sin enviar. ¡No olvides sincronizarlos!`,
  //               sound: true,
  //               priority: Notifications.AndroidNotificationPriority.HIGH,
  //             },
  //             trigger: null,
  //           });
  //         }
  //       }
  //     } catch (e) {
  //       // Silenciar errores de notificación
  //     }
  //   };
  //   checkPendingFormsAndNotify();
  // }, []);

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
        <Text style={styles.sectionTitleWhite}>Assigned forms</Text>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: height * 0.11, // Espacio para la tab-bar
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
                    paddingHorizontal: width * 0.03, // Espacio lateral interno
                  }}
                  showsVerticalScrollIndicator={false}
                  horizontal={false}
                >
                  {userForms &&
                    userForms.map(
                      (form) =>
                        form && (
                          <View style={styles.formCardWrapper} key={form.id}>
                            <FormCard
                              form={form}
                              onPress={() => handleFormPress(form)}
                            />
                          </View>
                        )
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
    letterSpacing: 1,
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
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 6,
    paddingBottom: Platform.OS === "ios" ? 18 : 8,
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    zIndex: 10,
  },
  tabBarButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: "column",
    marginHorizontal: 4,
  },
  tabBarButtonActive: {
    backgroundColor: "#4B34C722",
  },
  tabBarButtonDanger: {
    backgroundColor: "#ef444422",
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
  // ...otros estilos existentes si es necesario...
});
