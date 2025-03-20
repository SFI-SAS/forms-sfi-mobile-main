import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

export function Home({ setIsLogged }) {
  const [allProjects, setAllProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [showForms, setShowForms] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [userData, setUserData] = useState({ name: "", email: "" });

  const syncOfflineResponses = async () => {
    try {
      const offlineResponses = await AsyncStorage.getItem("offline_responses");
      if (offlineResponses) {
        const parsedResponses = JSON.parse(offlineResponses);
        console.log("📤 Enviando respuestas guardadas offline...");

        for (const response of parsedResponses) {
          await fetch(
            `https://1a67-179-33-13-68.ngrok-free.app/responses/save-responses/${response.formId}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${await AsyncStorage.getItem("authToken")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(response.data),
            }
          );
          console.log("📨 Enviada:", response.data);
        }

        await AsyncStorage.removeItem("offline_responses");
        Alert.alert(
          "Sincronización",
          "Las respuestas offline han sido enviadas."
        );
      }
    } catch (error) {
      console.error("❌ Error sincronizando respuestas:", error);
    }
  };

  useEffect(() => {
    const checkToken = async () => {
      try {
        const savedToken = await AsyncStorage.getItem("authToken");
        if (savedToken) {
          NetInfo.fetch().then((state) => {
            if (state.isConnected) {
              console.log("🌐 Conectado a internet, cargando datos...");
              validateToken(savedToken);
              getProjectsFromAPI(savedToken);
            } else {
              console.log("⚠️ Sin conexión, usando datos offline...");
              setIsOffline(true);
              loadProjectsOffline();
              loadUserDataOffline();
            }
          });
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error("❌ Error obteniendo el token:", error);
        setLoading(false);
      }
    };

    checkToken();

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
      if (state.isConnected) {
        Alert.alert("🌐 Internet volvió, actualizando datos...");
        refreshData();
        syncOfflineResponses();
      } else {
        Alert.alert("⚠️ Se perdió la conexión, usando datos offline...");
      }
    });

    return () => unsubscribe();
  }, []);

  const validateToken = async (token) => {
    try {
      const response = await fetch(
        "https://1a67-179-33-13-68.ngrok-free.app/auth/validate-token",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const json = await response.json();
      console.log("✅ Validación de token:", json.user);

      if (response.ok) {
        setUserData({ name: json.user.name, email: json.user.email });
        await AsyncStorage.setItem("userData", JSON.stringify(json));
      }
    } catch (error) {
      console.error("❌ Error validando token:", error);
    }
  };

  const loadUserDataOffline = async () => {
    try {
      const storedUserData = await AsyncStorage.getItem("userData");
      if (storedUserData) {
        setUserData(JSON.parse(storedUserData));
      }
    } catch (error) {
      console.error("❌ Error cargando datos de usuario offline:", error);
    }
  };

  const getProjectsFromAPI = async (token) => {
    try {
      const response = await fetch(
        "https://1a67-179-33-13-68.ngrok-free.app/projects/all_projects/",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const json = await response.json();

      if (!response.ok) throw new Error("Error al obtener proyectos");

      await AsyncStorage.setItem("offline_projects", JSON.stringify(json));

      setAllProjects(json);
      setIsOffline(false);
    } catch (error) {
      console.error("❌ API error:", error);
      loadProjectsOffline();
    } finally {
      setLoading(false);
    }
  };

  const getFormsForProject = async (projectId) => {
    const token = await AsyncStorage.getItem("authToken");
    try {
      const response = await fetch(
        `https://1a67-179-33-13-68.ngrok-free.app/projects/by-project/${projectId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const json = await response.json();
      if (!response.ok) throw new Error("Error al obtener formularios");

      console.log(json);

      await AsyncStorage.setItem(
        `offline_forms_${projectId}`,
        JSON.stringify(json)
      );

      setShowForms(json);
      setModalVisible(true);
    } catch (error) {
      console.error("❌ Error obteniendo formularios:", error);
      loadFormsOffline(projectId);
    }
  };

  const loadProjectsOffline = async () => {
    try {
      const storedProjects = await AsyncStorage.getItem("offline_projects");
      if (storedProjects) {
        setAllProjects(JSON.parse(storedProjects));
        Alert.alert("✅ Proyectos cargados offline");
      } else {
        console.log("⚠️ No hay proyectos guardados offline");
      }
    } catch (error) {
      console.error("❌ Error cargando proyectos offline:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadFormsOffline = async (projectId) => {
    try {
      const storedForms = await AsyncStorage.getItem(
        `offline_forms_${projectId}`
      );
      if (storedForms) {
        setShowForms(JSON.parse(storedForms));
        setModalVisible(true);
        console.log("✅ Formularios cargados offline");
      } else {
        console.log("⚠️ No hay formularios guardados offline");
      }
    } catch (error) {
      console.error("❌ Error cargando formularios offline:", error);
    }
  };

  const refreshData = async () => {
    const token = await AsyncStorage.getItem("authToken");
    if (token) {
      getProjectsFromAPI(token);
    }
  };

  const handleSignOut = async () => {
    try {
      await AsyncStorage.setItem("isLoggedOut", "true");
      setIsLogged(false);
      console.log("🚪 Sesión cerrada correctamente.");
    } catch (error) {
      console.error("❌ Error al cerrar sesión:", error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Proyectos Disponibles</Text>
      <Text>
        Hola {userData.name} ({userData.email})
      </Text>
      <Text style={isOffline ? styles.offlineText : styles.onlineText}>
        Estado: {isOffline ? "🔴 Offline" : "🟢 Online"}
      </Text>

      {loading ? (
        <Text>Cargando...</Text>
      ) : (
        <FlatList
          data={allProjects}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.projectItem}
              onPress={() => getFormsForProject(item.id)}
            >
              <Text style={styles.projectName}>{item.name}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.header}>Formularios</Text>
            <FlatList
              data={showForms}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <View style={styles.formItem}>
                  <Text style={styles.formName}>
                    Nombre: {item.title} | Formulario: {item.id} | Fecha de
                    creación: {item.created_at}{" "}
                    <View>
                      <Text>Descripción: {item.description}</Text>
                    </View>
                  </Text>
                </View>
              )}
            />
            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
        <Text style={styles.signOutText}>Cerrar Sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  header: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  userInfo: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
    color: "#333",
  },
  onlineText: { color: "green", fontWeight: "bold", marginBottom: 10 },
  offlineText: { color: "red", fontWeight: "bold", marginBottom: 10 },
  projectItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  projectName: { fontSize: 16, color: "black" },

  /* 🔥 Estilos de la MODAL 🔥 */
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)", // Fondo oscuro
  },
  modalContent: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 10,
    width: "80%",
  },
  formItem: {
    padding: 10,
    borderBottomWidth: 5,
    borderBottomColor: "#ffffff",
    backgroundColor: "#0325E46B",
    borderRadius: 15,
  },
  formName: { fontSize: 16, color: "black" },

  /* Botón para cerrar la modal */
  closeButton: {
    marginTop: 10,
    backgroundColor: "#e63946",
    padding: 10,
    borderRadius: 5,
  },
  closeText: { color: "#fff", textAlign: "center", fontWeight: "bold" },

  /* 🔥 Botón de cerrar sesión 🔥 */
  signOutButton: {
    marginTop: 20,
    backgroundColor: "#e63946",
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
  },
  signOutText: { color: "#fff", fontWeight: "bold" },
});
