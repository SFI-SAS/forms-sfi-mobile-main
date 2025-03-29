import React from "react";
import { useNavigation } from "@react-navigation/native";
import { Main } from "../../components/Main";

export default function Index() {
  const navigation = useNavigation(); // Get the navigation prop
  return <Main navigation={navigation} />; // Pass the navigation prop to Main
}
