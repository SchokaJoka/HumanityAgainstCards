import { useAppSupabaseClient } from '~/utils/supabase'
import type { Tables } from '../../types/database.types'

export type CardSet = Tables<'sets'>
export type Card = Tables<'cards'>

export const useCards = () => {
  const supabase = useAppSupabaseClient();

  if (!supabase) {
    console.error("Supabase client not initialized");
    throw new Error("Supabase client not available");
  }

  // Fetch all card sets
  const getCardSets = async () => {
    const { data, error } = await supabase
      .from("sets")
      .select("*")
      .order("name");

    if (error) {
      console.error("Error fetching card sets:", error);
      return [];
    }

    console.log("Fetched card sets:", data);

    return data as CardSet[];
  };

  // Fetch black cards for a specific set
  const getBlackCards = async (setId: string) => {
    const { data, error } = await supabase
      .from("cards")
      .select("*")
      .eq("set_id", setId)
      .eq("is_black", true);

    if (error) {
      console.error("Error fetching black cards:", error);
      return [];
    }

    return data as Card[];
  };

  // Fetch white cards for a specific set
  const getWhiteCards = async (setId: string) => {
    const { data, error } = await supabase
      .from("cards")
      .select("*")
      .eq("set_id", setId)
      .eq("is_black", false);

    if (error) {
      console.error("Error fetching white cards:", error);
      return [];
    }

    return data as Card[];
  };

  // Fetch a set with all its cards
  const getSetWithCards = async (setId: string) => {
    const [set, blackCards, whiteCards] = await Promise.all([
      supabase.from("sets").select("*").eq("id", setId).single(),
      getBlackCards(setId),
      getWhiteCards(setId),
    ]);

    if (set.error) {
      console.error("Error fetching set:", set.error);
      return null;
    }

    return {
      set: set.data as CardSet,
      blackCards,
      whiteCards,
      totalCards: blackCards.length + whiteCards.length,
    };
  };

  // Fetch cards from multiple sets
  const getCardsFromSets = async (setIds: string[]) => {
    const blackCardsPromises = setIds.map((id) => getBlackCards(id));
    const whiteCardsPromises = setIds.map((id) => getWhiteCards(id));

    const [blackCardsArrays, whiteCardsArrays] = await Promise.all([
      Promise.all(blackCardsPromises),
      Promise.all(whiteCardsPromises),
    ]);

    // Flatten and shuffle
    const allBlackCards = blackCardsArrays.flat();
    const allWhiteCards = whiteCardsArrays.flat();

    return {
      blackCards: shuffleArray(allBlackCards),
      whiteCards: shuffleArray(allWhiteCards),
    };
  };

  // Create a custom card set
  const createCustomSet = async (name: string, userId: string) => {
    const { data, error } = await supabase
      .from("sets")
      .insert({
        name,
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating custom set:", error);
      return null;
    }

    return data as CardSet;
  };

  // Add custom black card
  const addBlackCard = async (setId: string, text: string) => {
    const { data, error } = await supabase
      .from("cards")
      .insert({
        set_id: setId,
        text,
        is_black: true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error adding black card:", error);
      return null;
    }

    return data as Card;
  };

  // Add custom white card
  const addWhiteCard = async (setId: string, text: string) => {
    const { data, error } = await supabase
      .from("cards")
      .insert({
        set_id: setId,
        text,
        is_black: false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error adding white card:", error);
      return null;
    }

    return data as Card;
  };

  return {
    getCardSets,
    getBlackCards,
    getWhiteCards,
    getSetWithCards,
    getCardsFromSets,
    createCustomSet,
    addBlackCard,
    addWhiteCard,
  };
};

// Helper function to shuffle array
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i] as T;
    shuffled[i] = shuffled[j] as T;
    shuffled[j] = temp;
  }
  return shuffled;
}

