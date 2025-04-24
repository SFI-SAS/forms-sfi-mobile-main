import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  BackHandler,
  Dimensions, // Import Dimensions
  Modal,
  TextInput,
  Keyboard,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router"; // Add this import
import { HomeIcon } from "./Icons"; // Adjust the import path as necessary

const { width, height } = Dimensions.get("window"); // Get screen dimensions
const INACTIVITY_TIMEOUT = 8 * 60 * 1000; // 8 minutos

export default function PendingForms() {
  const [pendingForms, setPendingForms] = useState([]);
  const [isOnline, setIsOnline] = useState(false);
  const router = useRouter();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState("");
  const [syncQueue, setSyncQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [pendingSync, setPendingSync] = useState(false);
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

  useEffect(() => {
    const resetInactivityTimer = async () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      inactivityTimer.current = setTimeout(async () => {
        await AsyncStorage.setItem("isLoggedOut", "true");
        setShowLogoutModal(true);
      }, INACTIVITY_TIMEOUT);
    };

    const reset = () => resetInactivityTimer();
    const focusListener = () => reset();
    const keyboardListener = Keyboard.addListener("keyboardDidShow", reset);
    const interval = setInterval(reset, 1000 * 60 * 4);

    reset();

    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      keyboardListener.remove();
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const fetchPendingForms = async () => {
      const storedPendingForms = await AsyncStorage.getItem("pending_forms");
      setPendingForms(storedPendingForms ? JSON.parse(storedPendingForms) : []);
    };

    fetchPendingForms();
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected);
      if (state.isConnected && pendingForms.length > 0) {
        setPendingSync(true);
      }
    });
    return () => unsubscribe();
  }, [pendingForms]);

  useEffect(() => {
    if (pendingSync && isOnline && pendingForms.length > 0) {
      setShowPasswordModal(true);
      setSyncQueue([...pendingForms]);
      setPendingSync(false);
    }
  }, [pendingSync, isOnline, pendingForms]);

  const handlePasswordSubmit = async () => {
    setSyncing(true);
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");

      const res = await fetch(
        "https://0077-179-33-13-68.ngrok-free.app/auth/validate-password",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ password }),
        }
      );
      if (!res.ok) {
        Alert.alert(
          "Contraseña incorrecta",
          "La contraseña es incorrecta. Intenta de nuevo."
        );
        setSyncing(false);
        return;
      }

      const successfullySentForms = [];
      for (const form of syncQueue) {
        try {
          await handleSubmitPendingForm(form, token);
          successfullySentForms.push(form.id);
        } catch (error) {
          Alert.alert(
            "Error",
            `No se pudo sincronizar el formulario ID ${form.id}`
          );
        }
      }

      const updatedPendingForms = pendingForms.filter(
        (form) => !successfullySentForms.includes(form.id)
      );
      setPendingForms(updatedPendingForms);
      await AsyncStorage.setItem(
        "pending_forms",
        JSON.stringify(updatedPendingForms)
      );
      setShowPasswordModal(false);
      setPassword("");
      setSyncQueue([]);
      Alert.alert("Sincronización", "Formularios sincronizados correctamente.");
    } catch (error) {
      Alert.alert("Error", "No se pudo validar la contraseña o sincronizar.");
    } finally {
      setSyncing(false);
    }
  };

  const handleSubmitPendingForm = async (form, tokenOverride = null) => {
    try {
      const token = tokenOverride || (await AsyncStorage.getItem("authToken"));
      if (!token) throw new Error("No authentication token found");

      const requestOptions = {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      };

      const saveResponseRes = await fetch(
        `https://0077-179-33-13-68.ngrok-free.app/responses/save-response/${form.id}?mode=offline`,
        {
          method: "POST",
          headers: requestOptions.headers,
        }
      );

      const saveResponseData = await saveResponseRes.json();
      const responseId = saveResponseData.response_id;

      for (const response of form.responses) {
        await fetch(
          `https://0077-179-33-13-68.ngrok-free.app/responses/save-answers`,
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
      }

      console.log(`✅ Formulario ID ${form.id} enviado correctamente.`);
    } catch (error) {
      console.error(`❌ Error al enviar formulario ID ${form.id}:`, error);
      throw error;
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.header}>Formularios Pendientes</Text>
        {pendingForms.length === 0 ? (
          <Text style={styles.noPendingText}>
            No hay formularios en estado offline pendientes.
          </Text>
        ) : (
          pendingForms.map((form, index) => (
            <View key={index} style={styles.formItem}>
              <Text style={styles.formText}>Formulario ID: {form.id}</Text>
              <TouchableOpacity
                style={styles.submitButton}
                onPress={() => {
                  setSyncQueue([form]);
                  setShowPasswordModal(true);
                }}
                disabled={!isOnline}
              >
                <Text style={styles.submitButtonText}>
                  {isOnline ? "Enviar" : "Sin conexión"}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.push("/home")}
        >
          <Text style={styles.backButtonText}>
            <HomeIcon color={"white"} />
            {"  "}
            Home
          </Text>
        </TouchableOpacity>
      </ScrollView>
      <Modal
        visible={showPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!syncing) setShowPasswordModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirmar sincronización</Text>
            <Text style={styles.modalText}>
              Por seguridad, ingresa tu contraseña para sincronizar los datos
              pendientes.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Contraseña"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!syncing}
            />
            <View style={{ flexDirection: "row", marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: "#2563eb" }]}
                onPress={handlePasswordSubmit}
                disabled={syncing || !password}
              >
                <Text style={styles.modalButtonText}>
                  {syncing ? "Sincronizando..." : "Sincronizar"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: "#aaa" }]}
                onPress={() => {
                  if (!syncing) setShowPasswordModal(false);
                  setPassword("");
                  setSyncQueue([]);
                }}
                disabled={syncing}
              >
                <Text style={styles.modalButtonText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Sesión cerrada por inactividad
            </Text>
            <Text style={styles.modalText}>
              Por seguridad, la sesión se cerró automáticamente tras 8 minutos
              sin actividad.
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: "#2563eb" }]}
              onPress={() => {
                setShowLogoutModal(false);
                router.push("/");
              }}
            >
              <Text style={styles.modalButtonText}>Ir al inicio de sesión</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: width * 0.05, backgroundColor: "#ffffff" },
  header: {
    fontSize: width * 0.06,
    fontWeight: "bold",
    marginBottom: height * 0.02,
  },
  noPendingText: {
    fontSize: width * 0.045,
    color: "#555",
    textAlign: "center",
  },
  formItem: {
    padding: width * 0.04,
    backgroundColor: "#f0f0f0",
    borderRadius: width * 0.02,
    marginBottom: height * 0.02,
  },
  formText: { fontSize: width * 0.05, fontWeight: "bold" },
  submitButton: {
    marginTop: height * 0.01,
    padding: height * 0.02,
    backgroundColor: "#2563eb",
    borderRadius: width * 0.02,
    alignItems: "center",
  },
  submitButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
  backButton: {
    marginTop: height * 0.03,
    padding: height * 0.02,
    backgroundColor: "blue",
    borderRadius: width * 0.02,
    alignItems: "center",
  },
  backButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
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
  },
  modalText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  modalInput: {
    width: "100%",
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    marginBottom: 20,
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
    fontWeight: "bold",
  },
});
