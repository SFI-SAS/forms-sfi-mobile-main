import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Picker } from "@react-native-picker/picker";
import NetInfo from "@react-native-community/netinfo";

export default function FormatScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams(); // Recibir el ID del formulario como parámetro
  const { title } = useLocalSearchParams(); // Recibir el título del formulario como parámetro
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [tableAnswers, setTableAnswers] = useState({}); // State to store related answers for table questions
  const [userFieldSelection, setUserFieldSelection] = useState({}); // State to store selected field for "users" source

  const fetchQuestionsByFormId = async (formId) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");

      const response = await fetch(
        `https://54b8-179-33-13-68.ngrok-free.app/forms/${formId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();
      console.log("📋 Respuesta del endpoint para preguntas:", data.questions); // Debugger

      if (!response.ok)
        throw new Error(data.detail || "Error fetching questions");

      setQuestions(data.questions);

      // Guardar preguntas y metadatos del formulario en AsyncStorage para modo offline
      const storedForms = await AsyncStorage.getItem("offline_forms");
      const offlineForms = storedForms ? JSON.parse(storedForms) : {};

      if (!offlineForms[formId]) {
        offlineForms[formId] = {
          questions: data.questions,
          title: data.title,
          description: data.description,
        };
        await AsyncStorage.setItem(
          "offline_forms",
          JSON.stringify(offlineForms)
        );
      }
    } catch (error) {
      console.error("❌ Error al obtener las preguntas:", error.message);
      Alert.alert("Error", "No se pudieron cargar las preguntas.");
    } finally {
      setLoading(false);
    }
  };

  const loadOfflineQuestions = async (formId) => {
    try {
      const storedForms = await AsyncStorage.getItem("offline_forms");
      const offlineForms = storedForms ? JSON.parse(storedForms) : {};
      if (offlineForms[formId]) {
        setQuestions(offlineForms[formId].questions || []);
      } else {
        Alert.alert(
          "Modo Offline",
          "No hay preguntas guardadas para este formulario."
        );
      }
    } catch (error) {
      console.error("❌ Error cargando preguntas offline:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleFileUpload = async (questionId) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.type === "success") {
        handleAnswerChange(questionId, result.uri);
        Alert.alert("Archivo seleccionado", `Nombre: ${result.name}`);
      }
    } catch (error) {
      console.error("❌ Error seleccionando archivo:", error);
      Alert.alert("Error", "No se pudo seleccionar el archivo.");
    }
  };

  const fetchRelatedAnswers = async (questionId) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");

      const response = await fetch(
        `https://54b8-179-33-13-68.ngrok-free.app/questions/question-table-relation/answers/${questionId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Error HTTP! Estado: ${response.status}`);
      }

      const data = await response.json();

      // Handle "pregunta_relacionada" and "usuarios" sources
      if (data.source === "pregunta_relacionada") {
        setTableAnswers((prev) => ({
          ...prev,
          [questionId]: Array.isArray(data.respuestas)
            ? data.respuestas.map((item) => item.respuesta) // Extract "respuesta" for display
            : [],
        }));
      } else if (data.source === "usuarios") {
        setTableAnswers((prev) => ({
          ...prev,
          [questionId]: Array.isArray(data.data) ? data.data : [], // Store the full user objects
        }));
      }

      // Save related answers to AsyncStorage for offline use
      const storedAnswers = await AsyncStorage.getItem("offline_answers");
      const offlineAnswers = storedAnswers ? JSON.parse(storedAnswers) : {};
      offlineAnswers[questionId] = data;
      await AsyncStorage.setItem(
        "offline_answers",
        JSON.stringify(offlineAnswers)
      );

      console.log("📋 Respuestas relacionadas para pregunta tipo table:", data);
    } catch (error) {
      console.error("❌ Error obteniendo respuestas relacionadas:", error);
      setTableAnswers((prev) => ({
        ...prev,
        [questionId]: [], // On error, avoid invalid values
      }));
    }
  };

  const loadOfflineAnswers = async (questionId) => {
    try {
      const storedAnswers = await AsyncStorage.getItem("offline_answers");
      const offlineAnswers = storedAnswers ? JSON.parse(storedAnswers) : {};
      if (offlineAnswers[questionId]) {
        const data = offlineAnswers[questionId];
        if (data.source === "pregunta_relacionada") {
          setTableAnswers((prev) => ({
            ...prev,
            [questionId]: Array.isArray(data.respuestas)
              ? data.respuestas.map((item) => item.respuesta)
              : [],
          }));
        } else if (data.source === "usuarios") {
          setTableAnswers((prev) => ({
            ...prev,
            [questionId]: Array.isArray(data.data) ? data.data : [],
          }));
        }
      } else {
        console.warn("⚠️ No hay respuestas guardadas para esta pregunta.");
      }
    } catch (error) {
      console.error("❌ Error cargando respuestas offline:", error);
    }
  };

  useEffect(() => {
    if (id) {
      NetInfo.fetch().then((state) => {
        if (state.isConnected) {
          fetchQuestionsByFormId(id);
        } else {
          loadOfflineQuestions(id);
        }
      });
    }
  }, [id]);

  useEffect(() => {
    // Fetch related answers for table questions
    questions
      .filter((question) => question.question_type === "table")
      .forEach((question) => {
        NetInfo.fetch().then((state) => {
          if (state.isConnected) {
            fetchRelatedAnswers(question.id);
          } else {
            loadOfflineAnswers(question.id);
          }
        });
      });
  }, [questions]);

  const handleSubmitForm = async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");

      let hasError = false;
      const newErrors = {}; // Map for errors

      const responses = await Promise.all(
        questions.map(async (q) => {
          let responseValue = "";
          let filePath = "";

          if (q.question_type === "multiple_choice") {
            const selectedOptions = answers[q.id]?.split(",") || [];
            responseValue =
              selectedOptions.length > 0 ? selectedOptions.join(", ") : "";
          } else if (q.options?.length > 0) {
            responseValue = answers[q.id] || "";
          } else if (q.question_type === "file") {
            const fileUri = answers[q.id];
            if (fileUri) {
              const uploadFormData = new FormData();
              uploadFormData.append("file", {
                uri: fileUri,
                name: fileUri.split("/").pop(),
                type: "application/octet-stream",
              });

              try {
                const uploadResponse = await fetch(
                  `https://54b8-179-33-13-68.ngrok-free.app/responses/upload-file/`,
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${token}`,
                    },
                    body: uploadFormData,
                  }
                );

                const uploadResult = await uploadResponse.json();

                if (!uploadResponse.ok) {
                  throw new Error(
                    uploadResult.detail || "Error al subir el archivo"
                  );
                }

                filePath = uploadResult.file_name; // Get the uploaded file name
              } catch (error) {
                console.error("Error al subir archivo:", error);
                newErrors[q.id] = true;
                hasError = true;
              }
            } else if (q.required) {
              newErrors[q.id] = true;
              hasError = true;
            }
          } else {
            responseValue = answers[q.id] || "";
          }

          // Validate required questions
          if (q.required && responseValue.trim() === "") {
            newErrors[q.id] = true;
            hasError = true;
          }

          return {
            question_id: q.id,
            answer_text: responseValue,
            file_path: filePath,
          };
        })
      );

      if (hasError) {
        Alert.alert(
          "Error",
          "Por favor, responde todas las preguntas obligatorias."
        );
        return;
      }

      const mode = await NetInfo.fetch().then((state) =>
        state.isConnected ? "online" : "offline"
      );

      if (mode === "offline") {
        // Save responses locally for offline mode
        const storedPendingForms = await AsyncStorage.getItem("pending_forms");
        const pendingForms = storedPendingForms
          ? JSON.parse(storedPendingForms)
          : [];
        pendingForms.push({ id, responses, mode });
        await AsyncStorage.setItem(
          "pending_forms",
          JSON.stringify(pendingForms)
        );
        Alert.alert(
          "Guardado Offline",
          "El formulario se guardó en modo offline y será enviado cuando haya conexión."
        );
        router.back();
        return;
      }

      const requestOptions = {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      };

      try {
        // 1. Save the responses with the response_id and mode
        const saveResponseRes = await fetch(
          `https://54b8-179-33-13-68.ngrok-free.app/responses/save-response/${id}`,
          {
            method: "POST",
            headers: requestOptions.headers,
            body: JSON.stringify({ mode }),
          }
        );

        const saveResponseData = await saveResponseRes.json();
        const responseId = saveResponseData.response_id;

        // 2. Save each answer in the correct endpoint
        for (const response of responses) {
          try {
            await fetch(
              `https://54b8-179-33-13-68.ngrok-free.app/response/answers`,
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
          } catch (error) {
            console.error("Error en la solicitud:", error);
          }
        }

        Alert.alert("Éxito", "Respuestas enviadas correctamente.");
        router.back();
      } catch (err) {
        console.error("Error al enviar respuestas:", err);
        Alert.alert("Error", "Error al enviar respuestas.");
      }
    } catch (error) {
      console.error("❌ Error al guardar el formulario:", error);
      Alert.alert("Error", "No se pudo guardar el formulario.");
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Formulario: {title.toLocaleUpperCase()}</Text>
      <Text></Text>
      <Text style={styles.header}>ID: 00{id}</Text>

      <Text>Responde las preguntas a continuación:</Text>
      <Text>Recuerda que puedes subir archivos (si es necesario).</Text>
      <Text style={styles.subHeader}>Preguntas:</Text>
      <Text></Text>
      {loading ? (
        <Text>Cargando preguntas...</Text>
      ) : (
        questions.map((question) => (
          <View key={question.id} style={styles.questionContainer}>
            <Text style={styles.questionLabel}>
              {question.question_text}
              {question.required && (
                <Text style={styles.requiredText}> Pregunta obligatoria *</Text>
              )}
            </Text>
            {/* Render input types based on question type */}
            {question.question_type === "text" && (
              <TextInput
                style={styles.input}
                placeholder="Escribe tu respuesta"
                value={answers[question.id] || ""}
                onChangeText={(value) => handleAnswerChange(question.id, value)}
              />
            )}
            {question.question_type === "number" && (
              <TextInput
                style={styles.input}
                placeholder="Escribe un número"
                keyboardType="numeric"
                value={answers[question.id] || ""}
                onChangeText={(value) => handleAnswerChange(question.id, value)}
              />
            )}
            {question.question_type === "date" && (
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => Alert.alert("Seleccionar fecha")}
              >
                <Text style={styles.dateButtonText}>
                  {answers[question.id] || "Seleccionar fecha"}
                </Text>
              </TouchableOpacity>
            )}
            {question.question_type === "file" && (
              <TouchableOpacity
                style={styles.fileButton}
                onPress={() => handleFileUpload(question.id)}
              >
                <Text style={styles.fileButtonText}>
                  {answers[question.id]
                    ? "Archivo seleccionado"
                    : "Subir archivo"}
                </Text>
              </TouchableOpacity>
            )}
            {question.question_type === "table" && (
              <>
                {/* Handle "usuarios" source */}
                {Array.isArray(tableAnswers[question.id]) &&
                  tableAnswers[question.id].length > 0 &&
                  typeof tableAnswers[question.id][0] === "object" && (
                    <>
                      <Picker
                        selectedValue={userFieldSelection[question.id] || ""}
                        onValueChange={(value) =>
                          setUserFieldSelection((prev) => ({
                            ...prev,
                            [question.id]: value,
                          }))
                        }
                        style={styles.picker}
                      >
                        <Picker.Item label="Selecciona un campo" value="" />
                        {Object.keys(tableAnswers[question.id][0]).map(
                          (field, index) => (
                            <Picker.Item
                              key={index}
                              label={field}
                              value={field}
                            />
                          )
                        )}
                      </Picker>
                      {userFieldSelection[question.id] && (
                        <Picker
                          selectedValue={answers[question.id] || ""}
                          onValueChange={(value) =>
                            handleAnswerChange(question.id, value)
                          }
                          style={styles.picker}
                        >
                          <Picker.Item label="Selecciona una opción" value="" />
                          {tableAnswers[question.id].map((user, index) => (
                            <Picker.Item
                              key={index}
                              label={user[userFieldSelection[question.id]]}
                              value={user[userFieldSelection[question.id]]}
                            />
                          ))}
                        </Picker>
                      )}
                    </>
                  )}
                {/* Handle "pregunta_relacionada" source */}
                {Array.isArray(tableAnswers[question.id]) &&
                  typeof tableAnswers[question.id][0] === "string" && (
                    <Picker
                      selectedValue={answers[question.id] || ""}
                      onValueChange={(value) =>
                        handleAnswerChange(question.id, value)
                      }
                      style={styles.picker}
                    >
                      <Picker.Item label="Selecciona una opción" value="" />
                      {tableAnswers[question.id].map((option, index) => (
                        <Picker.Item
                          key={index}
                          label={option}
                          value={option}
                        />
                      ))}
                    </Picker>
                  )}
              </>
            )}
            {(question.question_type === "multiple_choice" ||
              question.question_type === "single_choice") &&
              question.options && (
                <Picker
                  selectedValue={answers[question.id] || ""}
                  onValueChange={(value) =>
                    handleAnswerChange(question.id, value)
                  }
                  style={styles.picker}
                >
                  <Picker.Item label="Selecciona una opción" value="" />
                  {question.options.map((option, index) => (
                    <Picker.Item key={index} label={option} value={option} />
                  ))}
                </Picker>
              )}
          </View>
        ))
      )}
      <TouchableOpacity style={styles.submitButton} onPress={handleSubmitForm}>
        <Text style={styles.submitButtonText}>Guardar Formulario</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>Volver</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#ffffff" },
  header: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  subHeader: { fontSize: 18, fontWeight: "bold", marginTop: 20 },
  questionContainer: { marginBottom: 20 },
  questionLabel: { fontSize: 25, fontWeight: "bold", marginBottom: 5 },
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
    marginTop: 10,
  },
  fileButton: {
    backgroundColor: "#2563eb",
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
    marginTop: 10,
  },
  fileButtonText: { color: "white", fontWeight: "bold" },
  dateButton: {
    backgroundColor: "#2563eb",
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
    marginTop: 10,
  },
  dateButtonText: { color: "white", fontWeight: "bold" },
  submitButton: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "green",
    borderRadius: 5,
    alignItems: "center",
  },
  submitButtonText: { color: "white", fontWeight: "bold" },
  backButton: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "blue",
    borderRadius: 5,
    alignItems: "center",
  },
  backButtonText: { color: "white", fontWeight: "bold" },
  requiredText: {
    color: "red",
    fontWeight: "bold",
    marginLeft: 5,
  },
});
