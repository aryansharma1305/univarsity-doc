"""Offline checks for benchmark statistics and acceptance; no Docker resources are touched."""
import copy
import unittest
from benchmark import accepted, distribution, metrics


class MeasurementTests(unittest.TestCase):
    def test_nearest_rank_and_empty_samples(self):
        self.assertEqual(distribution([9,1,5,3,7]),{'samples':5,'p50':5,'p95':9,'p99':9,'max':9})
        self.assertIsNone(distribution([])['p95'])
        self.assertEqual(distribution(list(range(1,101)))['p99'],99)

    def test_acceptance_requires_tail_throughput_and_resource_headroom(self):
        row={'cold_latency_seconds':{'p95':1.5,'p99':1.6},'warm':{
            'latency_seconds':{'reviewer':{'p95':.05,'p99':.1},'university':{'p95':.05,'p99':.1}},
            'throughput_rps':80,'errors':{'reviewer':0,'university':0},'timeouts':0,
            'resources':{'memory_peak_since_start_mib':30,'oom_kills':0}}}
        self.assertTrue(accepted(row))
        for key,value in [('p95',2.01),('p99',3.01)]:
            bad=copy.deepcopy(row);bad['cold_latency_seconds'][key]=value;self.assertFalse(accepted(bad))
        for key,value in [('throughput_rps',19),('timeouts',1)]:
            bad=copy.deepcopy(row);bad['warm'][key]=value;self.assertFalse(accepted(bad))
        bad=copy.deepcopy(row);bad['warm']['errors']['university']=1;self.assertFalse(accepted(bad))
        bad=copy.deepcopy(row);bad['warm']['latency_seconds']['reviewer']['p99']=.501;self.assertFalse(accepted(bad))
        bad=copy.deepcopy(row);bad['warm']['resources']['oom_kills']=1;self.assertFalse(accepted(bad))

    def test_cpu_usage_uses_core_seconds_not_machine_cpu_count(self):
        before={'usage_usec':1_000_000,'nr_throttled':10,'nr_periods':10,'throttled_usec':100_000,
                'memory_current':0,'memory_peak':0,'oom_kill':0}
        after={**before,'usage_usec':1_500_000,'nr_throttled':11,'nr_periods':30,'throttled_usec':200_000,
               'memory_current':20*1024**2,'memory_peak':30*1024**2}
        result=metrics(before,after,2)
        self.assertEqual(result['cpu_cores_average'],.25)
        self.assertEqual(result['throttled_periods'],1)
        self.assertEqual(result['memory_peak_since_start_mib'],30)


if __name__=='__main__':unittest.main()
