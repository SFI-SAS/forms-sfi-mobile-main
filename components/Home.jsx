import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Alert, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import { Picker } from "@react-native-picker/picker";

export default function Home() {
  const router = useRouter();
  const [defaultQuestions, setDefaultQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [generalForms, setGeneralForms] = useState([]);
  const [projectForms, setProjectForms] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  const fetchData = async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");

      const response = await fetch(
        "https://583d-179-33-13-68.ngrok-free.app/questions/filtered",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();
      console.log(data);
      if (!response.ok) throw new Error("Error fetching data");

      setDefaultQuestions(data.default_questions || []);
      const firstKey = Object.keys(data.answers)[0];
      setAnswers(firstKey ? data.answers[parseInt(firstKey)] : []);
      setGeneralForms(data.non_root_forms || []);

      await AsyncStorage.setItem(
        "offline_default_questions",
        JSON.stringify(data.default_questions)
      );
      await AsyncStorage.setItem(
        "offline_answers",
        JSON.stringify(data.answers)
      );
      await AsyncStorage.setItem(
        "offline_general_forms",
        JSON.stringify(data.non_root_forms)
      );
    } catch (error) {
      Alert.alert("Error", "No se pudieron cargar los datos online.");
    } finally {
      setLoading(false);
    }
  };

  const loadOfflineData = async () => {
    try {
      const storedQuestions = await AsyncStorage.getItem(
        "offline_default_questions"
      );
      const storedAnswers = await AsyncStorage.getItem("offline_answers");
      const storedGeneralForms = await AsyncStorage.getItem(
        "offline_general_forms"
      );

      if (storedQuestions) setDefaultQuestions(JSON.parse(storedQuestions));
      if (storedAnswers)
        setAnswers(Object.values(JSON.parse(storedAnswers))[0] || []);
      if (storedGeneralForms) setGeneralForms(JSON.parse(storedGeneralForms));
    } catch (error) {
      Alert.alert("Error", "No se pudieron cargar los datos offline.");
    } finally {
      setLoading(false);
    }
  };

  const handleProjectSelect = async (projectId) => {
    setSelectedProject(projectId);
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");

      const response = await fetch(
        "https://583d-179-33-13-68.ngrok-free.app/forms/forms-by-answers/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([projectId]),
        }
      );

      const data = await response.json();
      console.log(data)
      if (!response.ok) throw new Error("Error fetching project forms");

      setProjectForms(data);

      await AsyncStorage.setItem(
        `offline_project_forms_${projectId}`,
        JSON.stringify(data)
      );
    } catch (error) {
      Alert.alert(
        "Error",
        "No se pudieron cargar los formularios del proyecto."
      );
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

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const wasOffline = isOffline;
      setIsOffline(!state.isConnected);

      if (state.isConnected && wasOffline) {
        fetchData();
      } else if (!state.isConnected && !wasOffline) {
        loadOfflineData();
      }
    });

    NetInfo.fetch().then((state) => {
      setIsOffline(!state.isConnected);
      if (state.isConnected) {
        fetchData();
      } else {
        loadOfflineData();
      }
    });

    return () => unsubscribe();
  }, []);

  const handleFormPress = (form) => {
    // Obtener las respuestas asociadas al proyecto seleccionado
    const selectedProjectAnswers = answers.find(
      (answer) => answer.id === selectedProject
    );

    // Construir la información predeterminada basada en las respuestas
    const predefinedInfo = defaultQuestions.reduce((info, question) => {
      const answer = selectedProjectAnswers?.[question.key] || "Sin respuesta";
      return { ...info, [question.text]: answer };
    }, {});

    router.push({
      pathname: "/format-screen",
      params: {
        id: form.id,
        created_at: form.created_at,
        predefinedInfo: JSON.stringify(predefinedInfo), // Pasar información predeterminada como string
      },
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Proyectos y Formularios</Text>
      <Text style={isOffline ? styles.offlineText : styles.onlineText}>
        Status: {isOffline ? "Offline ◉" : "Online ◉"}
      </Text>
      {loading ? (
        <Text>Loading...</Text>
      ) : (
        <View>
          <Text style={styles.subHeader}>Proyectos</Text>
          <Picker
            selectedValue={selectedProject}
            onValueChange={(value) => handleProjectSelect(value)}
            style={styles.picker}
          >
            <Picker.Item label="Selecciona un proyecto" value={null} />
            {answers.map((answer) => (
              <Picker.Item
                key={answer.id}
                label={answer.text}
                value={answer.id}
              />
            ))}
          </Picker>

          {selectedProject && (
            <View>
              <Text style={styles.subHeader}>Formularios del Proyecto</Text>
              {projectForms.map((form) => (
                <TouchableOpacity
                  key={form.id}
                  style={styles.formItem}
                  onPress={() => handleFormPress(form)}
                >
                  <Text style={styles.formText}>{form.title}</Text>
                  <Text style={styles.formDescription}>{form.description}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.subHeader}>Formularios Generales</Text>
          {generalForms.map((form) => (
            <TouchableOpacity
              key={form.id}
              style={styles.formItem}
              onPress={() => handleFormPress(form)}
            >
              <Text style={styles.formText}>{form.title}</Text>
              <Text style={styles.formDescription}>{form.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
        <Text style={styles.logoutText}>Cerrar Sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#ffffff" },
  header: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  subHeader: { fontSize: 18, fontWeight: "bold", marginTop: 20 },
  onlineText: { color: "green", fontWeight: "bold", marginBottom: 10 },
  offlineText: { color: "red", fontWeight: "bold", marginBottom: 10 },
  picker: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    backgroundColor: "#f9f9f9",
    marginBottom: 20,
  },
  formItem: {
    padding: 10,
    backgroundColor: "#f0f0f0",
    borderRadius: 5,
    marginBottom: 10,
  },
  formText: { fontSize: 16, fontWeight: "bold" },
  formDescription: { fontSize: 14, color: "#555" },
  logoutButton: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "red",
    borderRadius: 5,
    alignItems: "center",
  },
  logoutText: {
    color: "white",
    fontWeight: "bold",
  },
});
