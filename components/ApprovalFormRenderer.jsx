import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Dimensions,
  Alert,
  ActivityIndicator,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import NetInfo from "@react-native-community/netinfo";

const { width, height } = Dimensions.get("window");
const BACKEND_URL_KEY = "backend_url";

const getBackendUrl = async () => {
  const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
  return stored || "";
};

export default function ApprovalFormRenderer({
  isOpen,
  onClose,
  formToFill,
  onFormSubmitted,
  parentResponseId,
  approvalRequirementId,
}) {
  const [answers, setAnswers] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !formToFill) return null;

  const handleAnswerChange = (questionId, value) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleFilePick = async (questionId) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.type === "success") {
        setAnswers((prev) => ({
          ...prev,
          [questionId]: result,
        }));
      }
    } catch (error) {
      console.error("Error picking file:", error);
      Alert.alert("Error", "No se pudo seleccionar el archivo");
    }
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);

      // Validar respuestas requeridas
      const requiredQuestions =
        formToFill.questions?.filter((q) => q.required) || [];
      for (const q of requiredQuestions) {
        if (!answers[q.id]) {
          Alert.alert(
            "Campo requerido",
            `La pregunta "${q.question_text}" es obligatoria`
          );
          setIsSubmitting(false);
          return;
        }
      }

      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        Alert.alert(
          "Sin conexión",
          "No se puede enviar el formulario sin conexión a internet"
        );
        setIsSubmitting(false);
        return;
      }

      const token = await AsyncStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token found");

      const backendUrl = await getBackendUrl();

      // Preparar FormData
      const formData = new FormData();

      // Agregar respuestas
      const answersArray = Object.entries(answers).map(([qId, value]) => {
        const question = formToFill.questions?.find((q) => q.id === parseInt(qId));
        
        if (question?.question_type === "file" && value?.uri) {
          // Para archivos, solo enviamos el ID, el archivo se enviará por separado
          return {
            question_id: parseInt(qId),
            answer_text: null,
            file: value.name,
          };
        }

        return {
          question_id: parseInt(qId),
          answer_text: typeof value === "string" ? value : String(value),
        };
      });

      formData.append("answers", JSON.stringify(answersArray));

      // Agregar información adicional
      if (parentResponseId) {
        formData.append("parent_response_id", String(parentResponseId));
      }
      if (approvalRequirementId) {
        formData.append("approval_requirement_id", String(approvalRequirementId));
      }

      // Agregar archivos
      Object.entries(answers).forEach(([qId, value]) => {
        const question = formToFill.questions?.find((q) => q.id === parseInt(qId));
        if (question?.question_type === "file" && value?.uri) {
          formData.append("files", {
            uri: value.uri,
            name: value.name,
            type: value.mimeType || "application/octet-stream",
          });
        }
      });

      const response = await fetch(
        `${backendUrl}/responses/submit/${formToFill.id}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      const data = await response.json();

      if (response.ok) {
        Alert.alert("Éxito", "Formulario enviado correctamente", [
          {
            text: "OK",
            onPress: () => {
              setAnswers({});
              onFormSubmitted();
            },
          },
        ]);
      } else {
        throw new Error(data?.detail || "Error al enviar el formulario");
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      Alert.alert("Error", error.message || "No se pudo enviar el formulario");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderQuestion = (question) => {
    const answer = answers[question.id];

    switch (question.question_type) {
      case "text":
      case "email":
        return (
          <TextInput
            style={styles.input}
            value={answer || ""}
            onChangeText={(text) => handleAnswerChange(question.id, text)}
            placeholder={`Ingrese ${question.question_text.toLowerCase()}`}
            keyboardType={question.question_type === "email" ? "email-address" : "default"}
          />
        );

      case "number":
        return (
          <TextInput
            style={styles.input}
            value={answer || ""}
            onChangeText={(text) => handleAnswerChange(question.id, text)}
            placeholder="Ingrese un número"
            keyboardType="numeric"
          />
        );

      case "textarea":
        return (
          <TextInput
            style={[styles.input, styles.textArea]}
            value={answer || ""}
            onChangeText={(text) => handleAnswerChange(question.id, text)}
            placeholder={`Ingrese ${question.question_text.toLowerCase()}`}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        );

      case "select":
        return (
          <View style={styles.selectContainer}>
            {question.options?.map((option, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.selectOption,
                  answer === option && styles.selectOptionActive,
                ]}
                onPress={() => handleAnswerChange(question.id, option)}
              >
                <Text
                  style={[
                    styles.selectOptionText,
                    answer === option && styles.selectOptionTextActive,
                  ]}
                >
                  {option}
                </Text>
                {answer === option && (
                  <MaterialIcons name="check-circle" size={20} color="#2563eb" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        );

      case "file":
        return (
          <View>
            <TouchableOpacity
              style={styles.fileButton}
              onPress={() => handleFilePick(question.id)}
            >
              <MaterialIcons name="attach-file" size={24} color="#2563eb" />
              <Text style={styles.fileButtonText}>
                {answer ? "Cambiar archivo" : "Seleccionar archivo"}
              </Text>
            </TouchableOpacity>
            {answer && (
              <View style={styles.selectedFile}>
                <MaterialIcons name="insert-drive-file" size={20} color="#16a34a" />
                <Text style={styles.selectedFileName} numberOfLines={1}>
                  {answer.name}
                </Text>
                <TouchableOpacity
                  onPress={() => handleAnswerChange(question.id, null)}
                >
                  <MaterialIcons name="close" size={20} color="#ef4444" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        );

      case "date":
        return (
          <TextInput
            style={styles.input}
            value={answer || ""}
            onChangeText={(text) => handleAnswerChange(question.id, text)}
            placeholder="YYYY-MM-DD"
          />
        );

      default:
        return (
          <TextInput
            style={styles.input}
            value={answer || ""}
            onChangeText={(text) => handleAnswerChange(question.id, text)}
            placeholder="Ingrese su respuesta"
          />
        );
    }
  };

  return (
    <Modal visible={isOpen} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{formToFill.title}</Text>
              {formToFill.description && (
                <Text style={styles.description}>{formToFill.description}</Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} disabled={isSubmitting}>
              <MaterialIcons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Questions */}
          <ScrollView style={styles.questionsContainer}>
            {formToFill.questions?.map((question, index) => (
              <View key={question.id} style={styles.questionCard}>
                <Text style={styles.questionText}>
                  {index + 1}. {question.question_text}
                  {question.required && (
                    <Text style={styles.required}> *</Text>
                  )}
                </Text>
                {renderQuestion(question)}
              </View>
            ))}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={onClose}
              disabled={isSubmitting}
              style={[styles.button, styles.cancelButton]}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={isSubmitting}
              style={[styles.button, styles.submitButton]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Enviar formulario</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: height * 0.9,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1f2937",
  },
  description: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
  },
  questionsContainer: {
    flex: 1,
    padding: 20,
  },
  questionCard: {
    marginBottom: 24,
  },
  questionText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 12,
  },
  required: {
    color: "#ef4444",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: "#1f2937",
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  selectContainer: {
    gap: 8,
  },
  selectOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  selectOptionActive: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  selectOptionText: {
    fontSize: 15,
    color: "#4b5563",
  },
  selectOptionTextActive: {
    color: "#2563eb",
    fontWeight: "600",
  },
  fileButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#d1d5db",
    borderRadius: 12,
    backgroundColor: "#f9fafb",
    gap: 8,
  },
  fileButtonText: {
    color: "#2563eb",
    fontSize: 15,
    fontWeight: "600",
  },
  selectedFile: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    padding: 12,
    backgroundColor: "#dcfce7",
    borderRadius: 8,
    gap: 8,
  },
  selectedFileName: {
    flex: 1,
    fontSize: 14,
    color: "#15803d",
    fontWeight: "500",
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  cancelButtonText: {
    color: "#6b7280",
    fontSize: 15,
    fontWeight: "600",
  },
  submitButton: {
    backgroundColor: "#2563eb",
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});