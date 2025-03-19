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
          headerTitle: "FORMULARIOS SFI",
          headerTitleAlign:'center',
          headerLeft: () => <Logo />,
        }}
      />
    </View>
  );
}
