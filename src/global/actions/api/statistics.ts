import { areDeepEqual } from '../../../util/areDeepEqual';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { callApi } from '../../../api/gramjs';
import { addActionHandler, getGlobal, setGlobal } from '../../index';
import {
  updateChannelMonetizationStatistics,
  updateMessageStatistics,
  updateStatistics,
  updateStatisticsGraph,
  updateStoryStatistics,
  updateVerifyMonetizationModal,
} from '../../reducers';
import {
  selectChat,
  selectChatFullInfo,
  selectChatMessages,
  selectPeer,
  selectPeerStory,
  selectTabState,
} from '../../selectors';

addActionHandler('loadStatistics', async (global, actions, payload): Promise<void> => {
  const { chatId, isGroup, tabId = getCurrentTabId() } = payload;
  const chat = selectChat(global, chatId);
  const fullInfo = selectChatFullInfo(global, chatId);
  if (!chat || !fullInfo) {
    return;
  }

  const result = await callApi(
    isGroup ? 'fetchGroupStatistics' : 'fetchChannelStatistics',
    { chat, dcId: fullInfo.statisticsDcId },
  );
  if (!result) {
    return;
  }

  const { stats } = result;
  global = getGlobal();
  global = updateStatistics(global, chatId, stats, tabId);
  setGlobal(global);
});

addActionHandler('loadChannelMonetizationStatistics', async (global, actions, payload): Promise<void> => {
  const {
    peerId, tabId = getCurrentTabId(),
  } = payload;
  const peer = selectPeer(global, peerId);
  const chatFullInfo = selectChatFullInfo(global, peerId);
  if (!peer) {
    return;
  }

  const dcId = chatFullInfo?.statisticsDcId;
  const stats = await callApi('fetchChannelMonetizationStatistics', { peer, dcId });

  if (!stats) {
    return;
  }

  global = getGlobal();
  global = updateChannelMonetizationStatistics(global, stats, tabId);
  setGlobal(global);
});

addActionHandler('loadMessageStatistics', async (global, actions, payload): Promise<void> => {
  const { chatId, messageId, tabId = getCurrentTabId() } = payload;
  const chat = selectChat(global, chatId);
  const fullInfo = selectChatFullInfo(global, chatId);
  if (!chat || !fullInfo) {
    return;
  }

  const dcId = fullInfo.statisticsDcId;
  let result = await callApi('fetchMessageStatistics', { chat, messageId, dcId });
  if (!result) {
    result = {};
  }

  global = getGlobal();

  const {
    viewsCount,
    forwardsCount,
    reactions,
  } = selectChatMessages(global, chatId)[messageId] || {};
  result.viewsCount = viewsCount;
  result.forwardsCount = forwardsCount;
  result.reactionsCount = reactions?.results
    ? reactions?.results.reduce((acc, reaction) => acc + reaction.count, 0)
    : undefined;

  global = updateMessageStatistics(global, result, tabId);
  setGlobal(global);

  actions.loadMessagePublicForwards({
    chatId,
    messageId,
    tabId,
  });
});

addActionHandler('loadMessagePublicForwards', async (global, actions, payload): Promise<void> => {
  const { chatId, messageId, tabId = getCurrentTabId() } = payload;
  const chat = selectChat(global, chatId);
  const fullInfo = selectChatFullInfo(global, chatId);
  if (!chat || !fullInfo) {
    return;
  }

  const dcId = fullInfo.statisticsDcId;
  const stats = selectTabState(global, tabId).statistics.currentMessage || {};

  if (stats?.publicForwards && !stats.nextOffset) return;

  const publicForwards = await callApi('fetchMessagePublicForwards', {
    chat, messageId, dcId, offset: stats.nextOffset,
  });
  const {
    forwards,
    nextOffset,
    count,
  } = publicForwards || {};

  // Api returns the last element from the previous page as the first element
  const shouldOmitFirstElement = stats.publicForwardsData?.length && forwards?.length
    && areDeepEqual(stats.publicForwardsData[stats.publicForwardsData.length - 1], forwards[0]);

  global = getGlobal();
  global = updateMessageStatistics(global, {
    ...stats,
    publicForwards: count || forwards?.length,
    publicForwardsData: (stats.publicForwardsData || []).concat(
      shouldOmitFirstElement ? forwards.slice(1) : (forwards || []),
    ),
    nextOffset,
  }, tabId);
  setGlobal(global);
});

addActionHandler('loadStatisticsAsyncGraph', async (global, actions, payload): Promise<void> => {
  const {
    chatId, token, name, isPercentage, tabId = getCurrentTabId(),
  } = payload;
  const fullInfo = selectChatFullInfo(global, chatId);
  if (!fullInfo) {
    return;
  }

  const dcId = fullInfo.statisticsDcId;
  const result = await callApi('fetchStatisticsAsyncGraph', { token, dcId, isPercentage });

  if (!result) {
    return;
  }

  global = getGlobal();
  global = updateStatisticsGraph(global, chatId, name, result, tabId);
  setGlobal(global);
});

addActionHandler('loadStoryStatistics', async (global, actions, payload): Promise<void> => {
  const { chatId, storyId, tabId = getCurrentTabId() } = payload;
  const chat = selectChat(global, chatId);
  const fullInfo = selectChatFullInfo(global, chatId);
  if (!chat || !fullInfo) {
    return;
  }

  const dcId = fullInfo.statisticsDcId;
  let result = await callApi('fetchStoryStatistics', { chat, storyId, dcId });
  if (!result) {
    result = {};
  }
  global = getGlobal();

  const story = selectPeerStory(global, chatId, storyId);
  const {
    forwardsCount = 0,
    viewsCount = 0,
    reactionsCount = 0,
  } = story && 'views' in story && story.views ? story.views : {};
  result.viewsCount = viewsCount;
  result.forwardsCount = forwardsCount;
  result.reactionsCount = reactionsCount;
  global = getGlobal();
  global = updateStoryStatistics(global, result, tabId);
  setGlobal(global);

  actions.loadStoryPublicForwards({
    chatId,
    storyId,
    tabId,
  });
});

addActionHandler('loadStoryPublicForwards', async (global, actions, payload): Promise<void> => {
  const { chatId, storyId, tabId = getCurrentTabId() } = payload;
  const chat = selectChat(global, chatId);
  const fullInfo = selectChatFullInfo(global, chatId);
  if (!chat || !fullInfo) {
    return;
  }

  const dcId = fullInfo.statisticsDcId;
  const stats = selectTabState(global, tabId).statistics.currentStory || {};

  if (stats?.publicForwards && !stats.nextOffset) return;

  const {
    publicForwards,
    count,
    nextOffset,
  } = await callApi('fetchStoryPublicForwards', {
    chat, storyId, dcId, offset: stats.nextOffset,
  }) || {};

  global = getGlobal();
  global = updateStoryStatistics(global, {
    ...stats,
    publicForwards: count || publicForwards?.length,
    publicForwardsData: (stats.publicForwardsData || []).concat(
      publicForwards || [],
    ),
    nextOffset,
  }, tabId);
  setGlobal(global);
});

addActionHandler('processMonetizationRevenueWithdrawalUrl', async (global, actions, payload): Promise<void> => {
  const {
    peerId, currentPassword, tabId = getCurrentTabId(),
  } = payload;

  global = updateVerifyMonetizationModal(global, {
    isLoading: true,
  }, tabId);
  setGlobal(global);

  const peer = selectPeer(global, peerId);
  if (!peer) {
    return;
  }

  const result = await callApi('fetchMonetizationRevenueWithdrawalUrl', { peer, currentPassword });

  if (!result) {
    return;
  }

  global = getGlobal();
  global = updateVerifyMonetizationModal(global, {
    isLoading: false,
    errorKey: 'error' in result ? result.messageKey : undefined,
  }, tabId);
  setGlobal(global);

  if ('url' in result) {
    actions.openUrl({
      url: result.url,
      shouldSkipModal: true,
      tabId,
      ignoreDeepLinks: true,
    });
    actions.closeMonetizationVerificationModal({ tabId });
  }
});
