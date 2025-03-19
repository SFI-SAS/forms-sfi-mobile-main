/* eslint-disable prettier/prettier */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";

export const saveResponseOffline = async (formId, responses) => {
  try {
    const storedResponses =
      (await AsyncStorage.getItem("offline_responses")) || "{}";
    const offlineResponses = JSON.parse(storedResponses);

    // Mover imágenes al directorio de documentos
    const updatedResponses = await Promise.all(
      responses.map(async (response) => {
        if (response.type === "image") {
          const fileName = response.content.split("/").pop();
          const newPath = `${FileSystem.documentDirectory}${fileName}`;
          await FileSystem.copyAsync({
            from: response.content,
            to: newPath,
          });
          return { ...response, content: newPath };
        }
        return response;
      })
    );

    offlineResponses[formId] = updatedResponses;
    await AsyncStorage.setItem(
      "offline_responses",
      JSON.stringify(offlineResponses)
    );
  } catch (error) {
    console.error("Error saving responses offline:", error);
  }
};

export const getOfflineResponses = async () => {
  try {
    const storedResponses = await AsyncStorage.getItem("offline_responses");
    return storedResponses ? JSON.parse(storedResponses) : {};
  } catch (error) {
    console.error("Error retrieving offline responses:", error);
    return {};
  }
};

export const clearOfflineResponses = async () => {
  try {
    await AsyncStorage.removeItem("offline_responses");
  } catch (error) {
    console.error("Error clearing offline responses:", error);
  }
};
