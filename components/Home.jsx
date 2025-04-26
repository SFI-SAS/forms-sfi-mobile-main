import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ScrollView,
  BackHandler,
  Dimensions, // Import Dimensions
  Animated, // Import Animated
  Easing, // Import Easing
  Image,
  Modal,
  TextInput,
  Keyboard,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Logo } from "./Logo";
import { SvgXml } from "react-native-svg"; // Import SvgXml
import { HomeIcon, InfoIcon } from "../components/Icons";

const { width, height } = Dimensions.get("window"); // Get screen dimensions

// Spinner SVG igual que en FormatScreen
const spinnerSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill="#000000FF" stroke="#EE4138FF" stroke-width="15" transform-origin="center" d="m148 84.7 13.8-8-10-17.3-13.8 8a50 50 0 0 0-27.4-15.9v-16h-20v16A50 50 0 0 0 63 67.4l-13.8-8-10 17.3 13.8 8a50 50 0 0 0 0 31.7l-13.8 8 10 17.3 13.8-8a50 50 0 0 0 27.5 15.9v16h20v-16a50 50 0 0 0 27.4-15.9l13.8 8 10-17.3-13.8-8a50 50 0 0 0 0-31.7Zm-47.5 50.8a35 35 0 1 1 0-70 35 35 0 0 1 0 70Z"><animateTransform type="rotate" attributeName="transform" calcMode="spline" dur="1.8" values="0;120" keyTimes="0;1" keySplines="0 0 1 1" repeatCount="indefinite"></animateTransform></path></svg>
`;

const QUESTIONS_KEY = "offline_questions";
const FORMS_METADATA_KEY = "offline_forms_metadata";
const RELATED_ANSWERS_KEY = "offline_related_answers";
const INACTIVITY_TIMEOUT = 8 * 60 * 1000; // 8 minutos

export default function Home() {
  const router = useRouter();
  const [userForms, setUserForms] = useState([]);
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState(null); // State to store user information
  const [spinAnim] = useState(new Animated.Value(0)); // Spinner animation state
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const inactivityTimer = useRef(null);

  useFocusEffect(
    React.useCallback(() => {
      const disableBack = () => true; // Disable hardware back button
      BackHandler.addEventListener("hardwareBackPress", disableBack);

      return () => {
        BackHandler.removeEventListener("hardwareBackPress", disableBack);
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
    try {
      const stored = await AsyncStorage.getItem(USER_INFO_KEY);
      if (stored) setUserInfo(JSON.parse(stored));
    } catch (e) {
      console.error("❌ Error cargando userInfo offline:", e);
    }
  };

  const fetchUserInfo = async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");

      const response = await fetch(
        "https://api-forms.sfisas.com.co/auth/validate-token",
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
          `https://api-forms.sfisas.com.co/forms/${form.id}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
        const qData = await qRes.json();
        console.log(qData);
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
                `https://api-forms.sfisas.com.co/questions/question-table-relation/answers/${question.id}`,
                {
                  method: "GET",
                  headers: { Authorization: `Bearer ${token}` },
                }
              );
              const relData = await relRes.json();
              allRelatedAnswers[question.id] = relData;
            } catch (e) {
              // Si falla, guarda vacío
              allRelatedAnswers[question.id] = {};
            }
          }
        }
      } catch (e) {
        // Si falla, sigue con el siguiente formulario
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
        "https://api-forms.sfisas.com.co/forms/users/form_by_user",
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
      Alert.alert(
        "Error",
        "No se pudieron cargar los formularios del usuario."
      );
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
      router.push("/");
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
        fetchUserInfo(); // Fetch user information when online

        // Synchronize pending forms when back online
        const storedPendingForms = await AsyncStorage.getItem("pending_forms");
        const pendingForms = storedPendingForms
          ? JSON.parse(storedPendingForms)
          : [];

        // Cargar seriales offline si existen
        let fileSerials = {};
        try {
          const serialsRaw = await AsyncStorage.getItem("file_serials_offline");
          if (serialsRaw) fileSerials = JSON.parse(serialsRaw);
        } catch {}

        for (const form of pendingForms) {
          try {
            const token = await AsyncStorage.getItem("authToken");
            if (!token) throw new Error("No authentication token found");

            const requestOptions = {
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            };

            // Submit the form
            const saveResponseRes = await fetch(
              `https://api-forms.sfisas.com.co/responses/save-response/${form.id}?mode=offline`,
              {
                method: "POST",
                headers: requestOptions.headers,
              }
            );

            const saveResponseData = await saveResponseRes.json();
            const responseId = saveResponseData.response_id;

            // Submit each answer
            for (const response of form.responses) {
              const answerRes = await fetch(
                `https://api-forms.sfisas.com.co/responses/save-answers`,
                {
                  method: "POST",
                  headers: requestOptions.headers,
                  body: JSON.stringify({
                    response_id: responseId,
                    question_id: response.question_id,
                    answer_text: response.answer_text,
                    file_path: response.file_path,
                  }),
                }
              );
              const answerJson = await answerRes.json();

              // Si es archivo y hay serial offline, asociar el serial al answer_id devuelto
              if (
                response.file_path &&
                fileSerials &&
                fileSerials[response.question_id] &&
                answerJson &&
                answerJson.answer &&
                answerJson.answer.answer_id
              ) {
                try {
                  const serialPayload = {
                    answer_id: answerJson.answer.answer_id,
                    serial: fileSerials[response.question_id],
                  };
                  await fetch(
                    "https://api-forms.sfisas.com.co/responses/file-serials/",
                    {
                      method: "POST",
                      headers: requestOptions.headers,
                      body: JSON.stringify(serialPayload),
                    }
                  );
                } catch (serialErr) {
                  console.error(
                    "❌ Error asociando serial offline al answer:",
                    serialErr
                  );
                }
              }
            }

            // Remove the form from pending forms
            const updatedPendingForms = pendingForms.filter(
              (f) => f.id !== form.id
            );
            await AsyncStorage.setItem(
              "pending_forms",
              JSON.stringify(updatedPendingForms)
            );
          } catch (error) {
            console.error(
              "❌ Error al sincronizar formulario pendiente:",
              error
            );
          }
        }
      } else {
        // SOLO cargar formularios locales, no consultar endpoint
        await loadOfflineForms();
        loadUserInfoOffline(); // Cargar info usuario offline
      }
    };

    checkNetworkStatus();

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
      if (state.isConnected) {
        AsyncStorage.getItem("pending_forms").then((stored) => {
          const pendingForms = stored ? JSON.parse(stored) : [];
          setPendingFormsForSync(pendingForms);
          if (pendingForms.length > 0) setPendingSync(true);
        });
      }
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

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // --- Inactividad: logout automático ---
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

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>Datos del usuario</Text>

        {userInfo && (
          <View style={styles.headerUserRow}>
            <View style={styles.headerUserCol}>
              <Text
                style={styles.headerUserName}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {userInfo.name}
              </Text>
              <Text style={styles.headerUserMiniLabel}>Email</Text>
              <Text
                style={styles.headerUserMiniValue}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {userInfo.email}
              </Text>
              <Text style={styles.headerUserMiniLabel}>Doc</Text>
              <Text
                style={styles.headerUserMiniValue}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {userInfo.num_document}
              </Text>
            </View>
            <View style={styles.headerUserCol}>
              <Text style={styles.headerUserMiniLabel}>Tel</Text>
              <Text
                style={styles.headerUserMiniValue}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {userInfo.telephone}
              </Text>
              <Text style={styles.headerUserMiniLabel}>Tipo</Text>
              <Text
                style={styles.headerUserMiniValue}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {userInfo.user_type}
              </Text>
              <Text
                style={[
                  styles.headerUserStatus,
                  isOffline ? styles.offlineText : styles.onlineText,
                ]}
              >
                {isOffline ? "Offline ◉" : "Online ◉"}
              </Text>
            </View>
          </View>
        )}
      </View>
      <Text style={styles.headerTitle}>
        Formatos asignados para este usuario
      </Text>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        {loading ? (
          <View style={{ alignItems: "center", marginVertical: 30 }}>
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <SvgXml xml={spinnerSvg} width={40} height={40} />
            </Animated.View>
            <Text style={styles.loadingText}>Cargando...</Text>
          </View>
        ) : (
          <View style={styles.formsScrollWrapper}>
            <ScrollView
              style={styles.formsContainer}
              contentContainerStyle={{ paddingBottom: 10 }}
              showsVerticalScrollIndicator={true}
            >
              {userForms &&
                userForms.map(
                  (form) =>
                    form && (
                      <TouchableOpacity
                        key={form.id}
                        style={styles.formItem}
                        onPress={() => handleFormPress(form)}
                      >
                        <Text
                          style={styles.formText}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {form.title}
                        </Text>
                        <Text
                          style={styles.formDescription}
                          numberOfLines={2}
                          ellipsizeMode="tail"
                        >
                          {form.description}
                        </Text>
                      </TouchableOpacity>
                    )
                )}
            </ScrollView>
          </View>
        )}
      </ScrollView>
      <View style={styles.fixedButtonsContainer}>
        <View style={styles.buttonsRow}>
          <TouchableOpacity
            onPress={handleNavigateToMyForms}
            style={styles.buttonMini}
          >
            <Text style={styles.buttonMiniText}>Diligenciados </Text>
            <Image
              source={require("../assets/fact_check_25dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.png")}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleNavigateToPendingForms}
            style={styles.buttonMini}
          >
            <Text style={styles.buttonMiniText}>Pendientes </Text>
            <Image
              source={require("../assets/sync_25dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.png")}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleLogout}
            style={styles.logoutButtonMini}
          >
            <Text style={styles.buttonMiniText}>Salir </Text>
            <Image
              source={require("../assets/logout_25dp_FFFFFF_FILL0_wght400_GRAD0_opsz24 (1).png")}
            />
          </TouchableOpacity>
        </View>
      </View>
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
              Por seguridad, la sesión se cerró automáticamente tras 8 minutos
              sin actividad.
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
                // Redirige al login
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
                Ir al inicio de sesión
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: width * 0.01, backgroundColor: "#f8f8f8" },
  headerCard: {
    backgroundColor: "#fff",
    borderRadius: width * 0.025,
    padding: width * 0.02,
    marginBottom: height * 0.005,
    marginTop: height * 0.005,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    borderColor: "#e0e0e0",
    borderWidth: 1,
    minHeight: height * 0.11,
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: width * 0.045,
    fontWeight: "bold",
    color: "#2563eb",
    marginBottom: 2,
    textAlign: "center",
  },
  headerUserRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: width * 0.02,
  },
  headerUserCol: {
    flex: 1,
    minWidth: width * 0.22,
    maxWidth: width * 0.5,
    paddingRight: width * 0.01,
  },
  headerUserName: {
    fontSize: width * 0.038,
    fontWeight: "bold",
    color: "#222",
    marginBottom: 1,
  },
  headerUserMiniLabel: {
    fontSize: width * 0.028,
    color: "#888",
    fontWeight: "bold",
    marginTop: 1,
  },
  headerUserMiniValue: {
    fontSize: width * 0.031,
    color: "#444",
    marginBottom: 1,
  },
  headerUserStatus: {
    fontSize: width * 0.032,
    fontWeight: "bold",
    marginTop: 2,
  },
  onlineText: {
    color: "green",
  },
  offlineText: {
    color: "red",
  },
  loadingText: {
    fontSize: width * 0.045,
    textAlign: "center",
    marginVertical: height * 0.02,
  },
  formsScrollWrapper: {
    flex: 1,
    maxHeight: height * 0.5,
    marginBottom: height * 0.01,
  },
  formsContainer: {
    flexGrow: 0,
    maxHeight: height * 0.5,
  },
  formItem: {
    padding: width * 0.03,
    backgroundColor: "#f0f0f0",
    borderRadius: width * 0.018,
    marginBottom: height * 0.012,
    borderColor: "#00000022",
    borderWidth: 1,
  },
  formText: {
    fontSize: width * 0.042,
    fontWeight: "bold",
    color: "#222",
  },
  formDescription: {
    fontSize: width * 0.032,
    color: "#555",
  },
  fixedButtonsContainer: {
    backgroundColor: "#fff",
    paddingTop: 4,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderColor: "#eee",
  },
  buttonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: width * 0.02,
    marginHorizontal: width * 0.01,
  },
  buttonMini: {
    flex: 1,
    marginHorizontal: width * 0.01,
    paddingVertical: height * 0.012,
    backgroundColor: "#2563eb",
    borderRadius: width * 0.018,
    alignItems: "center",
    borderColor: "#00000022",
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
  },
  buttonMiniText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.038,
  },
  logoutButtonMini: {
    flex: 1,
    marginHorizontal: width * 0.01,
    paddingVertical: height * 0.012,
    backgroundColor: "red",
    borderRadius: width * 0.018,
    alignItems: "center",
    borderColor: "#00000022",
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
  },
});
