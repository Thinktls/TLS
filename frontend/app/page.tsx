"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");
    if (!token) {
      router.replace("/login");
    } else if (role === "admin") {
      router.replace("/admin");
    } else {
      router.replace("/portal");
    }
  }, [router]);
  return null;
}
