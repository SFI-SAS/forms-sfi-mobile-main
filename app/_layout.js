import { Stack } from "expo-router";
import { View } from "react-native";
import { Logo } from "../components/Logo";

export default function Layout() {
  return (
    <View className="flex-1">
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "white" },
          headerTintColor: "black",
          headerTitle: () => <Logo />, // Logo centrado
          headerTitleAlign: "center",
          headerBackVisible: false, // Quita la flecha de volver atrás
        }}
      />
    </View>
  );
}
