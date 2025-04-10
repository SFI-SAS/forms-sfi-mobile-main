import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  BackHandler,
  Dimensions, // Import Dimensions
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Picker } from "@react-native-picker/picker";
import NetInfo from "@react-native-community/netinfo";
import DateTimePicker from "@react-native-community/datetimepicker"; // Import DateTimePicker
import { useFocusEffect } from "@react-navigation/native";

const { width, height } = Dimensions.get("window"); // Get screen dimensions

export default function FormatScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams(); // Recibir el ID del formulario como parámetro
  const { title } = useLocalSearchParams(); // Recibir el título del formulario como parámetro
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [tableAnswers, setTableAnswers] = useState({}); // State to store related answers for table questions
  const [userFieldSelection, setUserFieldSelection] = useState({}); // State to store selected field for "users" source

  useFocusEffect(
    React.useCallback(() => {
      const disableBack = () => true; // Disable hardware back button
      BackHandler.addEventListener("hardwareBackPress", disableBack);

      return () => {
        BackHandler.removeEventListener("hardwareBackPress", disableBack);
      };
    }, [])
  );

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

      // Adjust options for `multiple_choice` and `one_choice` question types
      const adjustedQuestions = data.questions.map((question) => {
        if (
          (question.question_type === "multiple_choice" ||
            question.question_type === "one_choice") &&
          Array.isArray(question.options)
        ) {
          return {
            ...question,
            options: question.options.map((option) => option.option_text), // Extract `option_text`
          };
        }
        return question;
      });

      setQuestions(adjustedQuestions);

      // Save questions and metadata for offline use
      const storedQuestions = await AsyncStorage.getItem("offline_questions");
      const offlineQuestions = storedQuestions
        ? JSON.parse(storedQuestions)
        : {};

      offlineQuestions[formId] = adjustedQuestions;
      await AsyncStorage.setItem(
        "offline_questions",
        JSON.stringify(offlineQuestions)
      );

      // Save form metadata separately
      const storedForms = await AsyncStorage.getItem("offline_forms");
      const offlineForms = storedForms ? JSON.parse(storedForms) : {};

      offlineForms[formId] = {
        title: data.title,
        description: data.description,
      };
      await AsyncStorage.setItem("offline_forms", JSON.stringify(offlineForms));

      console.log("✅ Preguntas y metadatos guardados en AsyncStorage.");
    } catch (error) {
      console.error("❌ Error al obtener las preguntas:", error.message);
      Alert.alert("Error", "No se pudieron cargar las preguntas.");
    } finally {
      setLoading(false);
    }
  };

  const loadOfflineQuestions = async (formId) => {
    try {
      const storedQuestions = await AsyncStorage.getItem("offline_questions");
      const offlineQuestions = storedQuestions
        ? JSON.parse(storedQuestions)
        : {};
      console.log(
        "📂 Preguntas cargadas desde AsyncStorage:",
        offlineQuestions
      );

      if (offlineQuestions[formId]) {
        setQuestions(offlineQuestions[formId]);
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

    // Save answers to AsyncStorage
    AsyncStorage.getItem("offline_answers")
      .then((storedAnswers) => {
        const offlineAnswers = storedAnswers ? JSON.parse(storedAnswers) : {};
        offlineAnswers[questionId] = value;
        return AsyncStorage.setItem(
          "offline_answers",
          JSON.stringify(offlineAnswers)
        );
      })
      .catch((error) =>
        console.error("❌ Error guardando respuestas en AsyncStorage:", error)
      );
  };

  const handleFileUpload = async (questionId) => {
    console.log("📂 Subiendo archivo para pregunta ID:", questionId);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*", // Allow all file types
        copyToCacheDirectory: true,
      });

      console.log("📄 Resultado del selector de documentos:", result);

      if (result && result.assets && result.assets.length > 0) {
        const file = result.assets[0]; // Extract the first file from the assets array
        console.log("✅ Archivo seleccionado:", file);

        handleAnswerChange(questionId, file.uri); // Save the file URI in the answers state
        Alert.alert("Archivo seleccionado", `Nombre: ${file.name}`);
      } else if (result && result.canceled) {
        console.log("⚠️ Selección de archivo cancelada por el usuario.");
      } else {
        console.error(
          "❌ Resultado inesperado del selector de documentos:",
          result
        );
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
          loadOfflineAnswers();
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
    console.log("📤 Enviando formulario ID:", id);
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
            const selectedOptions = answers[q.id] || [];
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

                filePath = uploadResult.file_name;
              } catch (error) {
                console.error("❌ Error al subir archivo:", error);
                newErrors[q.id] = true;
                hasError = true;
              }
            } else if (q.required) {
              newErrors[q.id] = true;
              hasError = true;
            }
          } else if (q.question_type === "date") {
            responseValue = answers[q.id] || "";
          } else {
            responseValue = answers[q.id] || "";
          }

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
        const storedPendingForms = await AsyncStorage.getItem("pending_forms");
        const pendingForms = storedPendingForms
          ? JSON.parse(storedPendingForms)
          : [];
        const currentDate = new Date();
        const submissionDate = currentDate.toISOString().split("T")[0]; // Format: YYYY-MM-DD
        const submissionTime = currentDate.toTimeString().split(" ")[0]; // Format: HH:MM:SS
        pendingForms.push({
          id,
          responses,
          mode: "offline",
          submission_date: submissionDate,
          submission_time: submissionTime,
        });
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
        console.log("✅ Respuesta guardada:", saveResponseData);
        const responseId = saveResponseData.response_id;

        // 2. Save each answer in the correct endpoint
        for (const response of responses) {
          try {
            const res = await fetch(
              `https://54b8-179-33-13-68.ngrok-free.app/responses/save-answers`,
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
            console.log("✅ Respuesta enviada:", await res.json());
          } catch (error) {
            console.error("❌ Error en la solicitud:", error);
          }
        }

        // Add submission date and time to the form
        const currentDate = new Date();
        const submissionDate = currentDate.toISOString().split("T")[0]; // Format: YYYY-MM-DD
        const submissionTime = currentDate.toTimeString().split(" ")[0]; // Format: HH:MM:SS
        saveResponseData.submission_date = submissionDate;
        saveResponseData.submission_time = submissionTime;

        Alert.alert("Éxito", "Respuestas enviadas correctamente.");
        router.back();
      } catch (err) {
        console.error("❌ Error al enviar respuestas:", err);
        Alert.alert("Error", "Error al enviar respuestas.");
      }
    } catch (error) {
      console.error("❌ Error al guardar el formulario:", error);
      Alert.alert("Error", "No se pudo guardar el formulario.");
    }
  };

  const handleMultipleChoiceChange = (questionId, option) => {
    setAnswers((prev) => {
      const currentAnswers = prev[questionId] || [];
      if (currentAnswers.includes(option)) {
        // Remove the option if it's already selected
        return {
          ...prev,
          [questionId]: currentAnswers.filter((o) => o !== option),
        };
      } else {
        // Add the option if it's not selected
        return { ...prev, [questionId]: [...currentAnswers, option] };
      }
    });
  };

  const handleOneChoiceChange = (questionId, option) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: option, // Replace the current selection with the new one
    }));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{title.toLocaleUpperCase()}</Text>
      <Text style={styles.subHeader}>ID: 00{id}</Text>
      <Text style={styles.instructions}>
        Responde las preguntas a continuación:
      </Text>
      <Text style={styles.instructions}>
        Recuerda que puedes subir archivos (si es necesario).
      </Text>
      <View style={styles.questionsContainer}>
        <ScrollView>
          {loading ? (
            <Text style={styles.loadingText}>Cargando preguntas...</Text>
          ) : (
            questions.map((question) => (
              <View key={question.id} style={styles.questionContainer}>
                <Text style={styles.questionLabel}>
                  {question.question_text}
                  {question.required && (
                    <Text style={styles.requiredText}> *</Text>
                  )}
                </Text>
                {/* Render input types based on question type */}
                {question.question_type === "text" && (
                  <TextInput
                    style={styles.input}
                    placeholder="Escribe tu respuesta"
                    value={answers[question.id] || ""}
                    onChangeText={(value) =>
                      handleAnswerChange(question.id, value)
                    }
                  />
                )}
                {(question.question_type === "multiple_choice" ||
                  question.question_type === "one_choice") &&
                  question.options && (
                    <View>
                      {question.options.map((option, index) => (
                        <View key={index} style={styles.checkboxContainer}>
                          <TouchableOpacity
                            style={[
                              styles.checkbox,
                              question.question_type === "multiple_choice" &&
                                answers[question.id]?.includes(option) &&
                                styles.checkboxSelected,
                              question.question_type === "one_choice" &&
                                answers[question.id] === option &&
                                styles.checkboxSelected,
                            ]}
                            onPress={() =>
                              question.question_type === "multiple_choice"
                                ? handleMultipleChoiceChange(
                                    question.id,
                                    option
                                  )
                                : handleOneChoiceChange(question.id, option)
                            }
                          >
                            {(question.question_type === "multiple_choice" &&
                              answers[question.id]?.includes(option)) ||
                            (question.question_type === "one_choice" &&
                              answers[question.id] === option) ? (
                              <Text style={styles.checkboxCheckmark}>✔</Text>
                            ) : null}
                          </TouchableOpacity>
                          <Text style={styles.checkboxLabel}>{option}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                {question.question_type === "number" && (
                  <TextInput
                    style={styles.input}
                    placeholder="Escribe un número"
                    keyboardType="numeric"
                    value={answers[question.id] || ""}
                    onChangeText={(value) =>
                      handleAnswerChange(question.id, value)
                    }
                  />
                )}
                {question.question_type === "date" && (
                  <TouchableOpacity
                    style={styles.dateButton}
                    onPress={() =>
                      Alert.alert(
                        "Seleccionar fecha",
                        "Por favor selecciona una fecha usando el selector." <
                          DateTimePicker >
                          <DateTimePicker />
                      )
                    }
                  >
                    <Text style={styles.dateButtonText}>
                      {answers[question.id] || "Seleccionar fecha"}
                    </Text>
                  </TouchableOpacity>
                )}
                {question.question_type === "file" && (
                  <TouchableOpacity
                    style={[
                      styles.fileButton,
                      answers[question.id] && { backgroundColor: "red" },
                    ]}
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
                            selectedValue={
                              userFieldSelection[question.id] || ""
                            }
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
                              <Picker.Item
                                label="Selecciona una opción"
                                value=""
                              />
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
              </View>
            ))
          )}
        </ScrollView>
      </View>
      <TouchableOpacity style={styles.submitButton} onPress={handleSubmitForm}>
        <Text style={styles.submitButtonText}>Guardar Formulario</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.push("/home")}
      >
        <Text style={styles.backButtonText}>Volver al Home</Text>
      </TouchableOpacity>
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
  subHeader: {
    fontSize: width * 0.05,
    fontWeight: "bold",
    marginBottom: height * 0.02,
  },
  instructions: {
    fontSize: width * 0.045,
    marginBottom: height * 0.01,
  },
  questionsContainer: {
    maxHeight: height * 0.5,
    backgroundColor: "#E4E4E4FF", // Limit height to 60% of the screen
    color: "white",
    marginBottom: height * 0.02,
    padding: 9,
    borderRadius: width * 0.02,
    borderColor: "#000000FF",
    borderWidth: 1,
  },
  loadingText: {
    fontSize: width * 0.05,
    textAlign: "center",
    marginVertical: height * 0.02,
  },
  questionContainer: { marginBottom: height * 0.02 },
  questionLabel: {
    fontSize: width * 0.05,
    fontWeight: "bold",
    marginBottom: height * 0.01,
  },
  requiredText: {
    color: "red",
    fontWeight: "bold",
  },
  submitButton: {
    marginTop: height * 0.03,
    padding: height * 0.02,
    backgroundColor: "green",
    borderRadius: width * 0.02,
    alignItems: "center",
    borderColor: "#000000FF",
    borderWidth: 1,
  },
  submitButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
    
  },
  backButton: {
    marginTop: height * 0.02,
    padding: height * 0.02,
    backgroundColor: "blue",
    borderRadius: width * 0.02,
    alignItems: "center",
    borderColor: "#000000FF",
    borderWidth: 1,
  },
  backButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: width * 0.02, // Dynamic border radius
    padding: height * 0.015, // Dynamic padding
    backgroundColor: "#f9f9f9",
    fontSize: width * 0.045, // Dynamic font size
    borderRadius: width * 0.02,
    borderColor: "#000000FF",
    borderWidth: 1,
  },
  picker: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: width * 0.02, // Dynamic border radius
    backgroundColor: "#f9f9f9",
    marginTop: height * 0.01,
    borderRadius: width * 0.02,
    borderColor: "#000000FF",
    borderWidth: 1,
  },
  fileButton: {
    backgroundColor: "#9225EBFF",
    padding: height * 0.02, // Dynamic padding
    borderRadius: width * 0.02, // Dynamic border radius
    alignItems: "center",
    marginTop: height * 0.02,
    borderColor: "#000000FF",
    borderWidth: 1,
  },
  fileButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045, // Dynamic font size
  },
  dateButton: {
    backgroundColor: "#EB9525FF",
    padding: height * 0.02, // Dynamic padding
    borderRadius: width * 0.02, // Dynamic border radius
    alignItems: "center",
    marginTop: height * 0.02,
    borderColor: "#000000FF",
    borderWidth: 1,
  },
  dateButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045, // Dynamic font size
  },
  requiredText: {
    color: "red",
    fontWeight: "bold",
    marginLeft: width * 0.01, // Dynamic margin
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: height * 0.01,
   
  },
  checkbox: {
    width: width * 0.08, // Dynamic size
    height: width * 0.08, // Dynamic size
    borderWidth: 3,
    borderColor: "#706C6CFF",
    borderRadius: width * 0.01, // Dynamic border radius
    justifyContent: "center",
    alignItems: "center",
    marginRight: width * 0.03, // Dynamic margin
  },
  checkboxSelected: {
    backgroundColor: "#20B46FFF",
    borderColor: "#020202FF",
  },
  checkboxCheckmark: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.04, // Dynamic font size
  },
  checkboxLabel: {
    fontSize: width * 0.045, // Dynamic font size
    color: "#333",
  },
});
