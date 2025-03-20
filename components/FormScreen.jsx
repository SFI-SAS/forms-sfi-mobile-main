import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export function FormularioScreen({ route, navigation }) {
  const { formId } = route.params;
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    const token = await AsyncStorage.getItem("authToken");
    try {
      const response = await fetch(
        `https://1a67-179-33-13-68.ngrok-free.app/forms/questions/${formId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const json = await response.json();
      if (!response.ok) throw new Error("Error al obtener preguntas");

      await AsyncStorage.setItem(
        `offline_questions_${formId}`,
        JSON.stringify(json)
      );

      setQuestions(json);
    } catch (error) {
      console.error("❌ Error obteniendo preguntas:", error);
      loadQuestionsOffline();
    } finally {
      setLoading(false);
    }
  };

  const loadQuestionsOffline = async () => {
    try {
      const storedQuestions = await AsyncStorage.getItem(
        `offline_questions_${formId}`
      );
      if (storedQuestions) {
        setQuestions(JSON.parse(storedQuestions));
      }
    } catch (error) {
      console.error("❌ Error cargando preguntas offline:", error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Formulario {formId}</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <FlatList
          data={questions}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.questionItem}>
              <Text style={styles.questionText}>{item.question}</Text>
            </View>
          )}
        />
      )}

      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Volver</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  header: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  questionItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  questionText: { fontSize: 16 },
  button: {
    marginTop: 20,
    backgroundColor: "#e63946",
    padding: 10,
    borderRadius: 5,
  },
  buttonText: { color: "#fff", textAlign: "center", fontWeight: "bold" },
});
