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
  const [textAnswers, setTextAnswers] = useState({});
  const [tableAnswersState, setTableAnswersState] = useState({});
  const [selectedAnswers, setSelectedAnswers] = useState({}); // Initialize selectedAnswers as an empty object
  const [datePickerVisible, setDatePickerVisible] = useState({}); // State to manage visibility of DateTimePicker

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

      if (result && !result.canceled && result.assets?.[0]?.uri) {
        handleAnswerChange(questionId, result.assets[0].uri); // Save the file URI in the answers state
        Alert.alert("Archivo seleccionado", `Ruta: ${result.assets[0].uri}`);
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

  const handleAddField = (questionId) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: Array.isArray(prev[questionId])
        ? [...prev[questionId], { id: Date.now(), value: "" }] // Add unique ID for each input
        : [{ id: Date.now(), value: "" }], // Ensure it's an array
    }));
  };

  const handleRemoveField = (questionId, fieldId) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: Array.isArray(prev[questionId])
        ? prev[questionId].filter((field) => field.id !== fieldId)
        : [],
    }));
  };

  const handleFieldChange = (questionId, fieldId, value) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: prev[questionId].map((field) =>
        field.id === fieldId ? { ...field, value } : field
      ),
    }));
  };

  const handleTextChange = (questionId, index, value) => {
    setTextAnswers((prev) => {
      const updatedAnswers = [...(prev[questionId] || [])];
      updatedAnswers[index] = value;
      return { ...prev, [questionId]: updatedAnswers };
    });
  };

  const handleAddTextField = (questionId) => {
    setTextAnswers((prev) => ({
      ...prev,
      [questionId]: [...(prev[questionId] || []), ""],
    }));
  };

  const handleRemoveTextField = (questionId, index) => {
    setTextAnswers((prev) => ({
      ...prev,
      [questionId]: prev[questionId].filter((_, i) => i !== index),
    }));
  };

  const handleTableSelectChange = (questionId, index, value) => {
    setTableAnswersState((prev) => {
      const updatedAnswers = [...(prev[questionId] || [])];
      updatedAnswers[index] = value;
      return { ...prev, [questionId]: updatedAnswers };
    });
  };

  const handleAddTableAnswer = (questionId) => {
    setTableAnswersState((prev) => ({
      ...prev,
      [questionId]: [...(prev[questionId] || []), ""],
    }));
  };

  const handleRemoveTableAnswer = (questionId, index) => {
    setTableAnswersState((prev) => ({
      ...prev,
      [questionId]: prev[questionId].filter((_, i) => i !== index),
    }));
  };

  const handleDateChange = (questionId, selectedDate) => {
    if (selectedDate) {
      const formattedDate = selectedDate.toISOString().split("T")[0]; // Format: YYYY-MM-DD
      setAnswers((prev) => ({ ...prev, [questionId]: formattedDate }));
    }
    setDatePickerVisible((prev) => ({ ...prev, [questionId]: false })); // Hide the DateTimePicker
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

  useEffect(() => {
    const initialTextAnswers = {};
    const initialTableAnswers = {};

    questions.forEach((q) => {
      if (q.question_type === "text") {
        initialTextAnswers[q.id] = [""];
      } else if (q.question_type === "table") {
        initialTableAnswers[q.id] = [""];
      }
    });

    setTextAnswers(initialTextAnswers);
    setTableAnswersState(initialTableAnswers);
  }, [questions]);

  const handleSubmitForm = async () => {
    console.log("📤 Enviando formulario ID:", id);
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");

      const mode = await NetInfo.fetch().then((state) =>
        state.isConnected ? "online" : "offline"
      );

      if (mode === "offline") {
        Alert.alert(
          "Modo Offline",
          "El formulario no puede ser enviado en modo offline."
        );
        return;
      }

      const requestOptions = {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      };

      // Iterate through each question and submit the form for each value
      for (const question of questions) {
        const questionId = question.id;
        let valuesToSubmit = [];

        if (
          question.question_type === "text" &&
          textAnswers[questionId]?.length > 0
        ) {
          valuesToSubmit = textAnswers[questionId].filter(
            (answer) => answer.trim() !== ""
          );
        } else if (
          question.question_type === "table" &&
          tableAnswersState[questionId]?.length > 0
        ) {
          valuesToSubmit = tableAnswersState[questionId].filter(
            (answer) => answer.trim() !== ""
          );
        } else if (question.question_type === "file") {
          const filePath = answers[questionId] || "";
          if (filePath) {
            valuesToSubmit = [filePath];
          }
        } else if (
          question.question_type === "date" &&
          answers[questionId]?.length > 0
        ) {
          valuesToSubmit = [answers[questionId]];
        } else if (
          question.question_type === "multiple_choice" &&
          selectedAnswers[questionId]?.length > 0
        ) {
          valuesToSubmit = selectedAnswers[questionId];
        } else if (
          question.question_type === "one_choice" &&
          selectedAnswers[questionId]?.length > 0
        ) {
          valuesToSubmit = [selectedAnswers[questionId][0]];
        }

        // Submit the form for each value of the current question
        for (const value of valuesToSubmit) {
          try {
            // Save the response and get the response ID
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

            // Submit the value as a new answer
            const res = await fetch(
              `https://54b8-179-33-13-68.ngrok-free.app/responses/save-answers`,
              {
                method: "POST",
                headers: requestOptions.headers,
                body: JSON.stringify({
                  response_id: responseId,
                  question_id: questionId,
                  answer_text: question.question_type === "file" ? "" : value,
                  file_path: question.question_type === "file" ? value : "",
                }),
              }
            );
            console.log("✅ Respuesta enviada:", await res.json());
          } catch (error) {
            console.error("❌ Error en la solicitud:", error);
          }
        }
      }

      Alert.alert("Éxito", "Respuestas enviadas correctamente.");
      router.back();
    } catch (error) {
      console.error("❌ Error al guardar el formulario:", error);
      Alert.alert("Error", "No se pudo guardar el formulario.");
    }
  };

  const handleMultipleChoiceChange = (questionId, option) => {
    setSelectedAnswers((prev) => {
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
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: [option], // Replace the current selection with the new one
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
                  <>
                    {textAnswers[question.id]?.map((field, index) => (
                      <View key={index} style={styles.dynamicFieldContainer}>
                        <TextInput
                          style={styles.input}
                          placeholder="Escribe tu respuesta"
                          value={field}
                          onChangeText={(text) =>
                            handleTextChange(question.id, index, text)
                          }
                        />
                        <TouchableOpacity
                          style={styles.removeButton}
                          onPress={() =>
                            handleRemoveTextField(question.id, index)
                          }
                        >
                          <Text style={styles.removeButtonText}>-</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity
                      style={styles.addButton}
                      onPress={() => handleAddTextField(question.id)}
                    >
                      <Text style={styles.addButtonText}>+</Text>
                    </TouchableOpacity>
                  </>
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
                    {tableAnswersState[question.id]?.map((field, index) => (
                      <View key={index} style={styles.dynamicFieldContainer}>
                        <Picker
                          selectedValue={field}
                          onValueChange={(selectedValue) =>
                            handleTableSelectChange(
                              question.id,
                              index,
                              selectedValue
                            )
                          }
                          style={styles.picker}
                        >
                          <Picker.Item label="Selecciona una opción" value="" />
                          {Array.isArray(tableAnswers[question.id]) &&
                            tableAnswers[question.id].map((option, i) => (
                              <Picker.Item
                                key={i}
                                label={option}
                                value={option}
                              />
                            ))}
                        </Picker>
                        <TouchableOpacity
                          style={styles.removeButton}
                          onPress={() =>
                            handleRemoveTableAnswer(question.id, index)
                          }
                        >
                          <Text style={styles.removeButtonText}>-</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity
                      style={styles.addButton}
                      onPress={() => handleAddTableAnswer(question.id)}
                    >
                      <Text style={styles.addButtonText}>+</Text>
                    </TouchableOpacity>
                  </>
                )}
                {question.question_type === "multiple_choice" &&
                  question.options && (
                    <View>
                      {question.options.map((option, index) => (
                        <View key={index} style={styles.checkboxContainer}>
                          <TouchableOpacity
                            style={[
                              styles.checkbox,
                              answers[question.id]?.includes(option) &&
                                styles.checkboxSelected,
                            ]}
                            onPress={() =>
                              setAnswers((prev) => {
                                const currentAnswers = prev[question.id] || [];
                                const updatedAnswers = currentAnswers.includes(
                                  option
                                )
                                  ? currentAnswers.filter((o) => o !== option)
                                  : [...currentAnswers, option];
                                return {
                                  ...prev,
                                  [question.id]: updatedAnswers,
                                };
                              })
                            }
                          >
                            {answers[question.id]?.includes(option) && (
                              <Text style={styles.checkboxCheckmark}>✔</Text>
                            )}
                          </TouchableOpacity>
                          <Text style={styles.checkboxLabel}>{option}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                {question.question_type === "one_choice" &&
                  question.options && (
                    <View>
                      {question.options.map((option, index) => (
                        <View key={index} style={styles.checkboxContainer}>
                          <TouchableOpacity
                            style={[
                              styles.checkbox,
                              answers[question.id] === option &&
                                styles.checkboxSelected,
                            ]}
                            onPress={() =>
                              setAnswers((prev) => ({
                                ...prev,
                                [question.id]: option,
                              }))
                            }
                          >
                            {answers[question.id] === option && (
                              <Text style={styles.checkboxCheckmark}>✔</Text>
                            )}
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
                    value={answers[question.id]?.[0] || ""}
                    onChangeText={(value) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [question.id]: [value],
                      }))
                    }
                  />
                )}
                {question.question_type === "date" && (
                  <>
                    <TouchableOpacity
                      style={styles.dateButton}
                      onPress={() =>
                        setDatePickerVisible((prev) => ({
                          ...prev,
                          [question.id]: true,
                        }))
                      }
                    >
                      <Text style={styles.dateButtonText}>
                        {answers[question.id] || "Seleccionar fecha"}
                      </Text>
                    </TouchableOpacity>
                    {datePickerVisible[question.id] && (
                      <DateTimePicker
                        value={
                          answers[question.id]
                            ? new Date(answers[question.id])
                            : new Date()
                        }
                        mode="date"
                        display="default"
                        onChange={(event, selectedDate) =>
                          handleDateChange(question.id, selectedDate)
                        }
                      />
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
    backgroundColor: "#4F87DBFF",
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
    backgroundColor: "red",
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
    width: width * 0.75, // Dynamic width
  },
  picker: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: width * 0.75, // Dynamic border radius
    backgroundColor: "#f9f9f9",
    marginTop: height * 0.01,
    borderRadius: width * 0.02,
    borderColor: "#000000FF",
    borderWidth: 1,
    width: width * 0.75, // Dynamic width
  },
  fileButton: {
    backgroundColor: "#9225EBFF",
    padding: height * 0.02, // Dynamic padding
    borderRadius: width * 0.02, // Dynamic border radius
    alignItems: "center",
    borderColor: "#000000FF",
    borderWidth: 1,
    width: width * 0.75, // Dynamic width
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
  dynamicFieldContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: height * 0.01,
    marginBottom: height * 0.01,
    width: width * 0.75, // Dynamic width

    justifyContent: "space-between",
  },
  addButton: {
    backgroundColor: "green",
    padding: height * 0.02,
    borderRadius: width * 0.6,
    alignItems: "center",
    marginTop: height * 0.01,
    width: width * 0.14, // Dynamic width
    borderColor: "#000000FF",
    borderWidth: 1,
  },
  addButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
  removeButton: {
    backgroundColor: "red",
    padding: height * 0.015,
    borderRadius: width * 0.02,
    marginLeft: width * 0.02,
  },
  removeButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
});
