import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  BackHandler,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { HomeIcon } from "./Icons";

export default function MyForms() {
  const [submittedForms, setSubmittedForms] = useState([]);
  const [responsesByForm, setResponsesByForm] = useState({});
  const [expandedForms, setExpandedForms] = useState({});
  const router = useRouter();

  useFocusEffect(
    React.useCallback(() => {
      const disableBack = () => true;
      BackHandler.addEventListener("hardwareBackPress", disableBack);
      return () => {
        BackHandler.removeEventListener("hardwareBackPress", disableBack);
      };
    }, [])
  );

  useEffect(() => {
    handleViewForms();
  }, []);

  // Cargar formularios enviados y sus respuestas (offline primero, si no online)
  const handleViewForms = async () => {
    try {
      const accessToken = await AsyncStorage.getItem("authToken");
      if (!accessToken) {
        console.error("Error: No hay token de acceso disponible.");
        return;
      }

      // Obtener formularios enviados
      const response = await fetch(
        `https://1943-179-33-13-68.ngrok-free.app/forms/users/completed_forms`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!response.ok)
        throw new Error("Error al cargar formularios enviados.");
      const data = await response.json();
      setSubmittedForms(data || []);

      // Obtener respuestas por formulario desde AsyncStorage (offline)
      if (Array.isArray(data) && data.length > 0) {
        const responsesObj = {};
        for (const form of data) {
          const key = `completed_form_answers_${form.id}`;
          try {
            const stored = await AsyncStorage.getItem(key);
            if (stored) {
              responsesObj[form.id] = JSON.parse(stored);
            } else {
              // Si no hay en memoria, intenta online (opcional)
              responsesObj[form.id] = [];
            }
          } catch {
            responsesObj[form.id] = [];
          }
        }
        setResponsesByForm(responsesObj);
      }
    } catch (error) {
      console.error("❌ Error al cargar formularios enviados:", error);
      Alert.alert("Error", "No se pudieron cargar los formularios enviados.");
    }
  };

  // Alternar visualización de respuestas por formulario
  const toggleExpand = (formId) => {
    setExpandedForms((prev) => ({
      ...prev,
      [formId]: !prev[formId],
    }));
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Formularios Enviados</Text>
      {submittedForms.length === 0 ? (
        <Text style={styles.noFormsText}>
          No hay formularios enviados disponibles.
        </Text>
      ) : (
        submittedForms.map((form, index) => (
          <View key={form.id} style={styles.formItem}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.formText}>Formulario ID: {form.id}</Text>
                <Text style={styles.formDescription}>
                  Título: {form.title || "Sin título"}
                </Text>
                {/* Indicador de modo de envío */}
                <Text
                  style={[
                    styles.formMode,
                    form.mode === "offline"
                      ? styles.formModeOffline
                      : styles.formModeOnline,
                  ]}
                >
                  {form.mode === "offline"
                    ? "Enviado Offline"
                    : "Enviado Online"}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.viewResponsesButton}
                onPress={() => toggleExpand(form.id)}
              >
                <Text style={styles.viewResponsesButtonText}>
                  {expandedForms[form.id]
                    ? "Ocultar respuestas"
                    : "Ver respuestas"}
                </Text>
              </TouchableOpacity>
            </View>
            {/* Respuestas expandibles */}
            {expandedForms[form.id] && (
              <View style={styles.responsesContainer}>
                {Array.isArray(responsesByForm[form.id]) &&
                responsesByForm[form.id].length > 0 ? (
                  responsesByForm[form.id].map((dilig, idx) => (
                    <View key={idx} style={styles.diligCard}>
                      <Text style={styles.diligHeader}>
                        Diligenciamiento #{idx + 1}
                      </Text>
                      <Text style={styles.diligMeta}>
                        Fecha: {dilig.submission_date || "Desconocida"} - Hora:{" "}
                        {dilig.submission_time || "Desconocida"}
                      </Text>
                      <Text
                        style={[
                          styles.formMode,
                          dilig.mode === "offline"
                            ? styles.formModeOffline
                            : styles.formModeOnline,
                        ]}
                      >
                        {dilig.mode === "offline" ? "Offline" : "Online"}
                      </Text>
                      {Array.isArray(dilig.answers) &&
                      dilig.answers.length > 0 ? (
                        dilig.answers.map((ans, i) => (
                          <View key={i} style={styles.answerRow}>
                            <Text style={styles.answerQuestion}>
                              {ans.question_text}:
                            </Text>
                            <Text style={styles.answerValue}>
                              {ans.answer_text || ans.file_path || "-"}
                            </Text>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.noAnswersText}>
                          Sin respuestas.
                        </Text>
                      )}
                    </View>
                  ))
                ) : (
                  <Text style={styles.noAnswersText}>
                    No hay respuestas para este formulario.
                  </Text>
                )}
              </View>
            )}
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#ffffff" },
  header: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  noFormsText: { fontSize: 16, color: "#555", textAlign: "center" },
  formItem: {
    padding: 10,
    backgroundColor: "#f0f0f0",
    borderRadius: 5,
    marginBottom: 10,
  },
  formText: { fontSize: 16, fontWeight: "bold" },
  formDescription: { fontSize: 14, color: "#555" },
  formMode: { fontSize: 13, fontWeight: "bold", marginTop: 2 },
  formModeOnline: { color: "green" },
  formModeOffline: { color: "orange" },
  viewResponsesButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 8,
    alignSelf: "flex-start",
  },
  viewResponsesButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 13,
  },
  responsesContainer: {
    marginTop: 10,
    backgroundColor: "#eaf1fb",
    borderRadius: 5,
    padding: 8,
  },
  diligCard: {
    backgroundColor: "#fff",
    borderRadius: 4,
    padding: 8,
    marginBottom: 10,
    borderColor: "#b0c4de",
    borderWidth: 1,
  },
  diligHeader: {
    fontWeight: "bold",
    fontSize: 15,
    marginBottom: 2,
    color: "#1a237e",
  },
  diligMeta: {
    fontSize: 13,
    color: "#555",
    marginBottom: 2,
  },
  answerRow: {
    flexDirection: "row",
    marginBottom: 2,
    flexWrap: "wrap",
  },
  answerQuestion: {
    fontWeight: "bold",
    fontSize: 13,
    color: "#333",
    marginRight: 4,
    flexShrink: 1,
    maxWidth: "50%",
  },
  answerValue: {
    fontSize: 13,
    color: "#222",
    flex: 1,
    flexWrap: "wrap",
  },
  noAnswersText: {
    fontSize: 13,
    color: "#888",
    fontStyle: "italic",
    marginVertical: 4,
  },
  backButton: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "blue",
    borderRadius: 5,
    alignItems: "center",
  },
  backButtonText: {
    color: "white",
    fontWeight: "bold",
  },
});
