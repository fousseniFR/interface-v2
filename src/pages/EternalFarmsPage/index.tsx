import React, { useMemo, useState } from 'react';
import { Box } from '@material-ui/core';
import { EternalFarmCard } from 'components/StakerEventCard/EternalFarmCard';
import { Frown } from 'react-feather';
import { useTranslation } from 'react-i18next';
import Loader from '../../components/Loader';
import { CustomModal } from 'components';
import { FarmModal } from '../../components/StakeModal';
import { FarmingType } from '../../models/enums';
import './index.scss';
import { FormattedEternalFarming } from 'models/interfaces';
import {
  useEternalFarmAprs,
  useEternalFarmPoolAPRs,
  useEternalFarmTvls,
  useEternalFarms,
} from 'hooks/useIncentiveSubgraph';
import { GlobalConst, GlobalData } from 'constants/index';
import { formatUnits } from 'ethers/lib/utils';
import useParsedQueryString from 'hooks/useParsedQueryString';
import { ChainId } from '@uniswap/sdk';
import { useUSDCPricesFromAddresses } from 'utils/useUSDCPrice';

const EternalFarmsPage: React.FC<{
  farmFilter: string;
  search: string;
  sortBy: string;
  sortDesc: boolean;
  chainId: ChainId;
}> = ({ farmFilter, search, sortBy, sortDesc, chainId }) => {
  const [modalForPool, setModalForPool] = useState(null);
  const { t } = useTranslation();
  const parsedQuery = useParsedQueryString();
  const farmStatus =
    parsedQuery && parsedQuery.farmStatus
      ? (parsedQuery.farmStatus as string)
      : 'active';

  const { v3FarmSortBy, v3FarmFilter } = GlobalConst.utils;

  const {
    data: allEternalFarms,
    isLoading: eternalFarmsLoading,
  } = useEternalFarms();

  const {
    data: eternalFarmPoolAprs,
    isLoading: eternalFarmPoolAprsLoading,
  } = useEternalFarmPoolAPRs();

  const {
    data: eternalFarmAprs,
    isLoading: eternalFarmAprsLoading,
  } = useEternalFarmAprs();

  const {
    data: eternalFarmTvls,
    isLoading: eternalFarmTvlsLoading,
  } = useEternalFarmTvls();

  const sortDescKey = sortDesc ? -1 : 1;

  const eternalFarms = useMemo(() => {
    if (!allEternalFarms) return [];
    return allEternalFarms
      .filter((farm) => {
        if (farmStatus === 'active') {
          return (
            (Number(farm.reward) > 0 || Number(farm.bonusReward) > 0) &&
            ((farm.rewardRate && Number(farm.rewardRate) > 0) ||
              (farm.bonusRewardRate && Number(farm.bonusRewardRate) > 0))
          );
        }
        return Number(farm.reward) === 0 && Number(farm.bonusReward) === 0;
      })
      .map((farm) => {
        return {
          ...farm,
          rewardRate: farmStatus === 'ended' ? '0' : farm.rewardRate,
          bonusRewardRate: farmStatus === 'ended' ? '0' : farm.bonusRewardRate,
        };
      });
  }, [allEternalFarms, farmStatus]);

  const rewardTokenAddresses = useMemo(() => {
    if (!eternalFarms || !eternalFarms.length) return [];
    return eternalFarms.reduce<string[]>((memo, farm) => {
      const rewardTokenAddress = memo.find(
        (item) =>
          farm &&
          farm.rewardToken &&
          farm.rewardToken.address.toLowerCase() === item,
      );
      const bonusRewardTokenAddress = memo.find(
        (item) =>
          farm &&
          farm.bonusRewardToken &&
          farm.bonusRewardToken.address.toLowerCase() === item,
      );
      if (!rewardTokenAddress && farm && farm.rewardToken) {
        memo.push(farm.rewardToken.address.toLowerCase());
      }
      if (!bonusRewardTokenAddress && farm.bonusRewardToken) {
        memo.push(farm.bonusRewardToken.address.toLowerCase());
      }
      return memo;
    }, []);
  }, [eternalFarms]);

  const { prices: rewardTokenPrices } = useUSDCPricesFromAddresses(
    rewardTokenAddresses,
  );

  const eternalFarmsFiltered = useMemo(() => {
    if (!eternalFarms || !eternalFarms.length) return [];
    return eternalFarms
      .filter((farm) => {
        const farmToken0Name =
          farm && farm.pool && farm.pool.token0 && farm.pool.token0.name
            ? farm.pool.token0.name
            : '';
        const farmToken1Name =
          farm && farm.pool && farm.pool.token1 && farm.pool.token1.name
            ? farm.pool.token1.name
            : '';
        const farmToken0Symbol =
          farm && farm.pool && farm.pool.token0 && farm.pool.token0.symbol
            ? farm.pool.token0.symbol
            : '';
        const farmToken1Symbol =
          farm && farm.pool && farm.pool.token1 && farm.pool.token1.symbol
            ? farm.pool.token1.symbol
            : '';
        const farmToken0Id =
          farm && farm.pool && farm.pool.token0
            ? farm.pool.token0.id ?? farm.pool.token0.address ?? ''
            : '';
        const farmToken1Id =
          farm && farm.pool && farm.pool.token1
            ? farm.pool.token1.id ?? farm.pool.token1.address ?? ''
            : '';
        const searchCondition =
          farmToken0Name.toLowerCase().includes(search) ||
          farmToken1Name.toLowerCase().includes(search) ||
          farmToken0Symbol.toLowerCase().includes(search) ||
          farmToken1Symbol.toLowerCase().includes(search) ||
          farmToken0Id.toLowerCase().includes(search) ||
          farmToken1Id.toLowerCase().includes(search);

        const blueChipCondition =
          !!GlobalData.blueChips[chainId].find(
            (token) =>
              token.address.toLowerCase() === farmToken0Id.toLowerCase(),
          ) &&
          !!GlobalData.blueChips[chainId].find(
            (token) =>
              token.address.toLowerCase() === farmToken1Id.toLowerCase(),
          );
        const stableCoinCondition =
          !!GlobalData.stableCoins[chainId].find(
            (token) =>
              token.address.toLowerCase() === farmToken0Id.toLowerCase(),
          ) &&
          !!GlobalData.stableCoins[chainId].find(
            (token) =>
              token.address.toLowerCase() === farmToken1Id.toLowerCase(),
          );
        const stablePair0 = GlobalData.stablePairs[chainId].find(
          (tokens) =>
            !!tokens.find(
              (token) =>
                token.address.toLowerCase() === farmToken0Id.toLowerCase(),
            ),
        );
        const stablePair1 = GlobalData.stablePairs[chainId].find(
          (tokens) =>
            !!tokens.find(
              (token) =>
                token.address.toLowerCase() === farmToken1Id.toLowerCase(),
            ),
        );
        const stableLPCondition =
          (stablePair0 &&
            stablePair0.find(
              (token) =>
                token.address.toLowerCase() === farmToken1Id.toLowerCase(),
            )) ||
          (stablePair1 &&
            stablePair1.find(
              (token) =>
                token.address.toLowerCase() === farmToken0Id.toLowerCase(),
            ));

        return (
          searchCondition &&
          (farmFilter === v3FarmFilter.blueChip
            ? blueChipCondition
            : farmFilter === v3FarmFilter.stableCoin
            ? stableCoinCondition
            : farmFilter === v3FarmFilter.stableLP
            ? stableLPCondition
            : farmFilter === v3FarmFilter.otherLP
            ? !blueChipCondition && !stableCoinCondition && !stableLPCondition
            : true)
        );
      })
      .sort((farm1, farm2) => {
        const farm1TokenStr =
          farm1.pool.token0.symbol + '/' + farm1.pool.token1.symbol;
        const farm2TokenStr =
          farm2.pool.token0.symbol + '/' + farm2.pool.token1.symbol;
        if (sortBy === v3FarmSortBy.tvl) {
          const farm1TVL =
            eternalFarmTvls && farm1 && farm1.id
              ? Number(eternalFarmTvls[farm1.id])
              : 0;
          const farm2TVL =
            eternalFarmTvls && farm2 && farm2.id
              ? Number(eternalFarmTvls[farm2.id])
              : 0;
          return farm1TVL > farm2TVL ? sortDescKey : -1 * sortDescKey;
        } else if (sortBy === v3FarmSortBy.apr) {
          const farm1FarmAPR =
            eternalFarmAprs && farm1 && farm1.id
              ? Number(eternalFarmAprs[farm1.id])
              : 0;
          const farm2FarmAPR =
            eternalFarmAprs && farm2 && farm2.id
              ? Number(eternalFarmAprs[farm2.id])
              : 0;
          const farm1PoolAPR =
            eternalFarmPoolAprs && farm1 && farm1.pool && farm1.pool.id
              ? Number(eternalFarmPoolAprs[farm1.pool.id])
              : 0;
          const farm2PoolAPR =
            eternalFarmPoolAprs && farm2 && farm2.pool && farm2.pool.id
              ? Number(eternalFarmPoolAprs[farm2.pool.id])
              : 0;
          return farm1FarmAPR + farm1PoolAPR > farm2FarmAPR + farm2PoolAPR
            ? sortDescKey
            : -1 * sortDescKey;
        } else if (sortBy === v3FarmSortBy.rewards) {
          const farm1RewardTokenPrice = rewardTokenPrices?.find(
            (item) =>
              farm1 &&
              item.address.toLowerCase() ===
                farm1.rewardToken.address.toLowerCase(),
          );
          const farm1BonusRewardTokenPrice = rewardTokenPrices?.find(
            (item) =>
              farm1 &&
              item.address.toLowerCase() ===
                farm1.bonusRewardToken.address.toLowerCase(),
          );
          const farm2RewardTokenPrice = rewardTokenPrices?.find(
            (item) =>
              farm2 &&
              item.address.toLowerCase() ===
                farm2.rewardToken.address.toLowerCase(),
          );
          const farm2BonusRewardTokenPrice = rewardTokenPrices?.find(
            (item) =>
              farm2 &&
              item.address.toLowerCase() ===
                farm2.bonusRewardToken.address.toLowerCase(),
          );
          const farm1Reward =
            farm1 && farm1.rewardRate && farm1RewardTokenPrice
              ? Number(
                  formatUnits(farm1.rewardRate, farm1.rewardToken.decimals),
                ) * farm1RewardTokenPrice.price
              : 0;
          const farm1BonusReward =
            farm1 && farm1.bonusRewardRate && farm1BonusRewardTokenPrice
              ? Number(
                  formatUnits(
                    farm1.bonusRewardRate,
                    farm1.bonusRewardToken.decimals,
                  ),
                ) * farm1BonusRewardTokenPrice.price
              : 0;
          const farm2Reward =
            farm2 && farm2.rewardRate && farm2RewardTokenPrice
              ? Number(
                  formatUnits(farm2.rewardRate, farm2.rewardToken.decimals),
                ) * farm2RewardTokenPrice.price
              : 0;
          const farm2BonusReward =
            farm2 && farm2.bonusRewardRate && farm2BonusRewardTokenPrice
              ? Number(
                  formatUnits(
                    farm2.bonusRewardRate,
                    farm2.bonusRewardToken.decimals,
                  ),
                ) * farm2BonusRewardTokenPrice.price
              : 0;
          return farm1Reward + farm1BonusReward > farm2Reward + farm2BonusReward
            ? sortDescKey
            : -1 * sortDescKey;
        }
        return farm1TokenStr > farm2TokenStr ? sortDescKey : -1 * sortDescKey;
      });
  }, [
    eternalFarmAprs,
    eternalFarmPoolAprs,
    eternalFarmTvls,
    eternalFarms,
    search,
    sortBy,
    sortDescKey,
    v3FarmSortBy,
    v3FarmFilter,
    farmFilter,
    rewardTokenPrices,
    chainId,
  ]);

  return (
    <>
      <CustomModal
        modalWrapper='farmModalWrapper'
        open={!!modalForPool}
        onClose={() => setModalForPool(null)}
      >
        {modalForPool && (
          <FarmModal
            event={modalForPool}
            closeHandler={() => setModalForPool(null)}
            farmingType={FarmingType.ETERNAL}
          />
        )}
      </CustomModal>

      <Box px={2} py={3}>
        {eternalFarmsLoading ? (
          <div className={'eternal-page__loader'}>
            <Loader stroke='white' size='1.5rem' />
          </div>
        ) : eternalFarmsFiltered.length === 0 ? (
          <div className={'eternal-page__loader'}>
            <div>
              {t(
                farmStatus === 'active'
                  ? 'noActiveEternalFarms'
                  : 'noEndedEternalFarms',
              )}
            </div>
            <Frown size={'2rem'} stroke={'white'} />
          </div>
        ) : !eternalFarmsLoading && eternalFarmsFiltered.length > 0 ? (
          <>
            {eternalFarmsFiltered.map(
              (event: FormattedEternalFarming, j: number) => (
                <Box mb={2} key={j}>
                  <EternalFarmCard
                    farmHandler={() => setModalForPool(event as any)}
                    now={0}
                    eternal
                    poolAprs={eternalFarmPoolAprs ?? undefined}
                    poolAprsLoading={eternalFarmPoolAprsLoading}
                    aprs={eternalFarmAprs ?? undefined}
                    aprsLoading={eternalFarmAprsLoading}
                    tvls={eternalFarmTvls}
                    tvlsLoading={eternalFarmTvlsLoading}
                    event={event}
                    chainId={chainId}
                  />
                </Box>
              ),
            )}
          </>
        ) : null}
      </Box>
    </>
  );
};

export default EternalFarmsPage;
