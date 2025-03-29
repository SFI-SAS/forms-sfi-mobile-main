import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Picker,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";

export default function FormatScreen() {
  const router = useRouter();
  const { id, created_at } = useLocalSearchParams(); // Use useLocalSearchParams to access route parameters
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);

  // Fetch questions for the selected form
  const handleQuestionsByIdForm = async (formId) => {
    try {
      const token = await AsyncStorage.getItem("authToken"); // Retrieve the token from AsyncStorage
      if (!token) throw new Error("No authentication token found");

      const response = await fetch(
        `https://d1b1-179-33-13-68.ngrok-free.app/forms/${formId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`, // Include the token in the Authorization header
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();
      if (!response.ok)
        throw new Error(data.detail || "Error fetching questions");

      setQuestions(data.questions); // Assuming the API returns a 'questions' field
      await AsyncStorage.setItem(
        `questions_form_${formId}`,
        JSON.stringify(data.questions)
      ); // Save questions to AsyncStorage for offline access
      console.log("Questions fetched and saved:", data.questions);
    } catch (error) {
      console.error("Error fetching questions:", error.message);
      Alert.alert(
        "Error",
        "Failed to fetch questions. Loading offline data..."
      );
      loadQuestionsOffline(formId); // Load questions from AsyncStorage if offline
    } finally {
      setLoading(false);
    }
  };

  // Load questions from AsyncStorage for offline access
  const loadQuestionsOffline = async (formId) => {
    try {
      const storedQuestions = await AsyncStorage.getItem(
        `questions_form_${formId}`
      );
      if (storedQuestions) {
        setQuestions(JSON.parse(storedQuestions));
        console.log("Loaded questions from offline storage:", storedQuestions);
      } else {
        console.log("No offline questions available for this form.");
      }
    } catch (error) {
      console.error("Error loading offline questions:", error.message);
    }
  };

  // Handle input changes for answers
  const handleAnswerChange = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  useEffect(() => {
    if (id) {
      handleQuestionsByIdForm(id); // Fetch questions when the component mounts
    }
  }, [id]);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Form Details</Text>
      <Text>ID: {id}</Text>
      <Text>Created At: {created_at}</Text>
      <Text style={styles.subHeader}>Questions</Text>
      {loading ? (
        <Text>Loading questions...</Text>
      ) : (
        questions.map((question) => (
          <View key={question.id} style={styles.questionContainer}>
            <Text style={styles.questionLabel}>{question.question_text}</Text>
            {question.question_type === "text" && (
              <TextInput
                style={styles.input}
                placeholder={question.placeholder || "Enter your answer"}
                value={answers[question.id] || ""}
                onChangeText={(value) => handleAnswerChange(question.id, value)}
              />
            )}
            {question.question_type === "number" && (
              <TextInput
                style={styles.input}
                placeholder={question.placeholder || "Enter a number"}
                keyboardType="numeric"
                value={answers[question.id] || ""}
                onChangeText={(value) => handleAnswerChange(question.id, value)}
              />
            )}
            {question.question_type === "select" && question.options && (
              <Picker
                selectedValue={answers[question.id] || ""}
                onValueChange={(value) =>
                  handleAnswerChange(question.id, value)
                }
                style={styles.picker}
              >
                <Picker.Item label="Select an option" value="" />
                {question.options.map((option) => (
                  <Picker.Item key={option} label={option} value={option} />
                ))}
              </Picker>
            )}
            {question.question_type === "multiple" && question.options && (
              <View>
                {question.options.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={styles.optionContainer}
                    onPress={() =>
                      handleAnswerChange(question.id, [
                        ...(answers[question.id] || []),
                        option,
                      ])
                    }
                  >
                    <Text style={styles.optionText}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ))
      )}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()} // Navigate back to Home
      >
        <Text style={styles.backButtonText}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "white" },
  header: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  subHeader: { fontSize: 18, fontWeight: "bold", marginTop: 20 },
  questionContainer: { marginBottom: 20 },
  questionLabel: { fontSize: 16, fontWeight: "bold", marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    padding: 10,
    backgroundColor: "#f9f9f9",
  },
  picker: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    backgroundColor: "#f9f9f9",
  },
  optionContainer: {
    padding: 10,
    marginVertical: 5,
    backgroundColor: "#f0f0f0",
    borderRadius: 5,
  },
  optionText: { fontSize: 14, color: "#333" },
  backButton: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "blue",
    borderRadius: 5,
    alignItems: "center",
  },
  backButtonText: { color: "white", fontWeight: "bold" },
});
